// Server-side only. Independent reference prices for the oracle check.
import { Account, Contract, TransactionBuilder, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { COINGECKO_IDS, NETWORK_CONFIG, type NetworkName } from "../config";
import type { ReferencePrice } from "../types";

const DUMMY = "GANXGJV2RNOFMOSQ2DTI3RKDBAVERXUVFC27KW3RLVQCLB3RYNO3AAI4";

async function simulate(net: NetworkName, contractId: string, fn: string, ...args: xdr.ScVal[]) {
  const c = NETWORK_CONFIG[net];
  const tx = new TransactionBuilder(new Account(DUMMY, "0"), {
    fee: "1000",
    networkPassphrase: c.passphrase,
    timebounds: { minTime: 0, maxTime: 0 },
  })
    .addOperation(new Contract(contractId).call(fn, ...args))
    .build();
  const res = await new rpc.Server(c.rpcUrl).simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(res) || !res.result) throw new Error(`simulation failed for ${fn}`);
  return scValToNative(res.result.retval);
}

/** Reflector "external CEX & DEX" feed, queried with SEP-40 Asset::Other(code). */
export async function reflectorCexPrices(net: NetworkName, codes: string[]): Promise<Record<string, ReferencePrice>> {
  const feed = NETWORK_CONFIG[net].reflectorCexFeed;
  const out: Record<string, ReferencePrice> = {};
  let decimals: number;
  try {
    decimals = Number(await simulate(net, feed, "decimals"));
  } catch (e) {
    for (const code of codes) out[code] = { source: "reflector-cex", price: null, error: (e as Error).message };
    return out;
  }
  await Promise.all(
    codes.map(async (code) => {
      try {
        const asset = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Other"), xdr.ScVal.scvSymbol(code)]);
        const v = (await simulate(net, feed, "lastprice", asset)) as { price: bigint; timestamp: bigint } | null;
        out[code] = v
          ? { source: "reflector-cex", price: Number(v.price) / 10 ** decimals }
          : { source: "reflector-cex", price: null, error: "feed has no price for this asset" };
      } catch (e) {
        out[code] = { source: "reflector-cex", price: null, error: (e as Error).message };
      }
    }),
  );
  return out;
}

/** CoinGecko public API (optional key via COINGECKO_API_KEY). Real-world prices, same for both networks. */
export async function coingeckoPrices(codes: string[], fetchImpl: typeof fetch = fetch) {
  const out: Record<string, ReferencePrice> = {};
  const ids = codes.map((c) => COINGECKO_IDS[c]).filter(Boolean);
  for (const c of codes) {
    if (!COINGECKO_IDS[c]) out[c] = { source: "coingecko", price: null, error: "no CoinGecko mapping" };
  }
  if (ids.length === 0) return out;
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    if (process.env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
    const res = await fetchImpl(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as Record<string, { usd?: number }>;
    for (const c of codes) {
      const id = COINGECKO_IDS[c];
      if (!id) continue;
      const p = json[id]?.usd;
      out[c] =
        typeof p === "number" && p > 0
          ? { source: "coingecko", price: p }
          : { source: "coingecko", price: null, error: "no price returned" };
    }
  } catch (e) {
    for (const c of codes) if (COINGECKO_IDS[c]) out[c] = { source: "coingecko", price: null, error: (e as Error).message };
  }
  return out;
}

export async function referencePrices(net: NetworkName, codes: string[]): Promise<Record<string, ReferencePrice[]>> {
  const unique = [...new Set(codes)];
  const [refl, cg] = await Promise.all([reflectorCexPrices(net, unique), coingeckoPrices(unique)]);
  const out: Record<string, ReferencePrice[]> = {};
  for (const c of unique) out[c] = [refl[c], cg[c]].filter(Boolean) as ReferencePrice[];
  return out;
}
