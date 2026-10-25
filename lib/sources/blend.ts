// Server-side only: never import this file from a client component.
import {
  BackstopConfig,
  Backstop,
  BackstopPoolEst,
  BackstopPoolV2,
  PoolMetadata,
  PoolV2,
  Positions,
  PositionsEstimate,
  PoolOracle,
  TokenMetadata,
  getOracleDecimals,
  getOraclePrice,
  type Network,
  type PriceData,
} from "@blend-capital/blend-sdk";
import { rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { NETWORK_CONFIG, extraPools, LIMITS, type NetworkName } from "../config";
import type { RawPool, RawPrice, RawReserve } from "../types";

export function sdkNetwork(net: NetworkName): Network {
  const c = NETWORK_CONFIG[net];
  return { rpc: c.rpcUrl, passphrase: c.passphrase, maxConcurrentRequests: 4 };
}

const codeCache = new Map<string, string | null>();

async function tokenCode(network: Network, assetId: string): Promise<string | null> {
  const key = `${network.passphrase}:${assetId}`;
  if (codeCache.has(key)) return codeCache.get(key)!;
  try {
    const meta = await TokenMetadata.load(network, assetId);
    const code = meta.asset ? (meta.asset.isNative() ? "XLM" : meta.asset.getCode()) : meta.symbol || null;
    codeCache.set(key, code);
    return code;
  } catch {
    return null; // not cached, so it is retried next time
  }
}

/** Pools to watch: the backstop's reward zone + known pools + any extra pools from env. */
export async function discoverPools(net: NetworkName): Promise<{ ids: string[]; error: string | null }> {
  const c = NETWORK_CONFIG[net];
  const ids = new Set<string>();
  let error: string | null = null;
  try {
    const cfg = await BackstopConfig.load(sdkNetwork(net), c.backstopId);
    cfg.rewardZone.forEach((id) => ids.add(id));
  } catch (e) {
    error = `Could not read the backstop reward zone: ${(e as Error).message}`;
  }
  c.knownPools.forEach((p) => ids.add(p.id));
  extraPools(net).forEach((id) => ids.add(id));
  return { ids: [...ids].slice(0, LIMITS.maxPools), error };
}

async function loadPrices(network: Network, oracleId: string, assets: string[]) {
  const out: Record<string, RawPrice | null> = {};
  let decimals: number | null = null;
  try {
    decimals = (await getOracleDecimals(network, oracleId)).decimals;
  } catch {
    decimals = null;
  }
  const results = await Promise.allSettled(assets.map((a) => getOraclePrice(network, oracleId, a)));
  results.forEach((r, i) => {
    const pd = r.status === "fulfilled" ? (r.value as PriceData) : null;
    out[assets[i]] =
      pd && decimals != null ? { price: Number(pd.price) / 10 ** decimals, timestamp: Number(pd.timestamp) } : null;
  });
  return { prices: out, decimals };
}

export async function loadRawPool(net: NetworkName, poolId: string): Promise<{ raw: RawPool; pool: PoolV2 }> {
  const network = sdkNetwork(net);
  const meta = await PoolMetadata.load(network, poolId);
  const pool = await PoolV2.loadWithMetadata(network, poolId, meta);

  const reserves: RawReserve[] = [];
  for (const [assetId, r] of pool.reserves) {
    reserves.push({
      assetId,
      index: r.config.index,
      decimals: r.config.decimals,
      code: await tokenCode(network, assetId),
      cFactor: r.getCollateralFactor(),
      lFactor: r.getLiabilityFactor(),
      maxUtil: r.config.max_util / 1e7,
      supplied: r.totalSupplyFloat(),
      borrowed: r.totalLiabilitiesFloat(),
      utilisation: r.getUtilizationFloat(),
      supplyApr: r.supplyApr,
      borrowApr: r.borrowApr,
    });
  }

  const { prices } = await loadPrices(network, meta.oracle, meta.reserveList);

  let backstopLiabilities: Record<string, number> | null = null;
  try {
    const pos = await Positions.load(network, poolId, meta.backstop);
    backstopLiabilities = {};
    for (const [assetId, r] of pool.reserves) {
      const d = pos.liabilities.get(r.config.index);
      if (d && d > BigInt(0)) backstopLiabilities[assetId] = r.toAssetFromDTokenFloat(d);
    }
  } catch {
    backstopLiabilities = null;
  }

  let backstop: RawPool["backstop"] = null;
  try {
    const [bs, bp] = await Promise.all([
      Backstop.load(network, meta.backstop),
      BackstopPoolV2.load(network, meta.backstop, poolId),
    ]);
    const est = BackstopPoolEst.build(bs.backstopToken, bp.poolBalance);
    backstop = { totalSpotValueUsd: est.totalSpotValue, q4wPct: est.q4wPercentage * 100 };
  } catch {
    backstop = null;
  }

  return {
    pool,
    raw: {
      poolId,
      name: meta.name,
      status: meta.status,
      oracleId: meta.oracle,
      backstopId: meta.backstop,
      latestLedger: meta.latestLedger,
      reserves,
      oraclePrices: prices,
      backstopLiabilities,
      backstop,
    },
  };
}

/**
 * Finds accounts that borrowed or posted collateral in a ledger range by reading pool events.
 * RPC providers keep only recent events (often ~7 days), so this only sees recent activity.
 */
export async function discoverAccounts(
  net: NetworkName,
  poolId: string,
  startLedger: number | null,
  maxPages = 10,
): Promise<{ accounts: string[]; nextLedger: number; oldestLedger: number }> {
  const server = new rpc.Server(NETWORK_CONFIG[net].rpcUrl);
  const latest = await server.getLatestLedger();
  const found = new Set<string>();
  const wanted = new Set(["borrow", "supply_collateral", "new_auction", "new_liquidation_auction"]);

  let request: rpc.Api.GetEventsRequest = {
    filters: [{ type: "contract", contractIds: [poolId] }],
    startLedger: startLedger ?? Math.max(1, latest.sequence - 17280 * 7), // ~7 days of 5s ledgers
    limit: 200,
  };
  let oldest = request.startLedger ?? 0;

  for (let page = 0; page < maxPages; page++) {
    let resp: rpc.Api.RawGetEventsResponse;
    try {
      resp = await server._getEvents(request);
    } catch (e) {
      // Start ledger older than retention: retry from the oldest retained ledger once.
      const m = /ledger range: (\d+)/.exec((e as Error).message);
      if (page === 0 && m) {
        request = { ...request, startLedger: Number(m[1]) } as rpc.Api.GetEventsRequest;
        oldest = Number(m[1]);
        continue;
      }
      throw e;
    }
    oldest = resp.oldestLedger ?? oldest;
    for (const ev of resp.events ?? []) {
      try {
        const topics = (ev.topic ?? []).map((t) => scValToNative(xdr.ScVal.fromXDR(t, "base64")));
        const name = String(topics[0]);
        if (!wanted.has(name)) continue;
        // borrow/supply_collateral: [name, asset, from]; auctions: [name, ..., user]
        for (const t of topics.slice(1)) {
          if (typeof t === "string" && /^[GC][A-Z2-7]{55}$/.test(t) && t !== poolId) {
            if (name === "borrow" || name === "supply_collateral") {
              if (t === topics[2]) found.add(t);
            } else found.add(t);
          }
        }
      } catch {
        /* skip undecodable events */
      }
    }
    if (!resp.events || resp.events.length < (request.limit ?? 200)) break;
    request = { filters: request.filters, cursor: resp.cursor, limit: 200 };
  }
  return { accounts: [...found], nextLedger: latest.sequence, oldestLedger: oldest };
}

/** Returns only health factors and liability values. Addresses are used to read, then dropped. */
export async function computeHealthFactors(
  net: NetworkName,
  pool: PoolV2,
  accounts: string[],
): Promise<{ hf: number; liabilitiesUsd: number }[]> {
  const network = sdkNetwork(net);
  const server = new rpc.Server(network.rpc);
  const oracle: PoolOracle = await pool.loadOracle();
  const out: { hf: number; liabilitiesUsd: number }[] = [];
  for (let i = 0; i < accounts.length; i += 100) {
    const batch = accounts.slice(i, i + 100);
    const resp = await server.getLedgerEntries(...batch.map((a) => Positions.ledgerKey(pool.id, a)));
    for (const entry of resp.entries ?? []) {
      try {
        const positions = Positions.fromLedgerEntryData(entry.val);
        if (positions.liabilities.size === 0) continue;
        const est = PositionsEstimate.build(pool, oracle, positions);
        if (!(est.totalEffectiveLiabilities > 0)) continue;
        out.push({ hf: est.totalEffectiveCollateral / est.totalEffectiveLiabilities, liabilitiesUsd: est.totalBorrowed });
      } catch {
        /* skip */
      }
    }
  }
  return out;
}
