import { thresholds, type NetworkName, type Thresholds } from "./config";
import {
  buildBadDebt,
  buildOracleChecks,
  buildReserves,
  poolTotals,
  referenceCode,
  statusLabel,
} from "./risk";
import type { NetworkReport, PoolReport, RawPool, ReferencePrice, StressReport } from "./types";

export interface MonitorDeps {
  discoverPools(net: NetworkName): Promise<{ ids: string[]; error: string | null }>;
  loadPool(net: NetworkName, poolId: string): Promise<RawPool>;
  referencePrices(net: NetworkName, codes: string[]): Promise<Record<string, ReferencePrice[]>>;
  now(): Date;
}

/** Pure function: turns raw chain data + reference prices into a report. Easy to test. */
export function buildPoolReport(
  net: NetworkName,
  raw: RawPool,
  refs: Record<string, ReferencePrice[]>,
  t: Thresholds,
  now: Date,
  stress: StressReport | null = null,
): PoolReport {
  const nowSec = Math.floor(now.getTime() / 1000);
  const reserves = buildReserves(raw, nowSec);
  const oracle = buildOracleChecks(reserves, refs, t);
  const warnings: string[] = [];
  if (reserves.some((r) => r.oraclePrice == null)) warnings.push("Some oracle prices could not be read; USD totals are unavailable.");
  if (raw.backstopLiabilities == null) warnings.push("Bad debt could not be read.");
  if (raw.backstop == null) warnings.push("Backstop balance could not be read.");
  if (net === "testnet") warnings.push("Testnet pools often use mock oracles, so price gaps on testnet are not meaningful.");

  const gaps = oracle.map((o) => o.gapPct).filter((g): g is number => g != null);
  const maxAbsGapPct = gaps.length ? gaps.reduce((a, g) => (Math.abs(g) > Math.abs(a) ? g : a), gaps[0]) : null;

  return {
    network: net,
    poolId: raw.poolId,
    name: raw.name,
    status: raw.status,
    statusLabel: statusLabel(raw.status),
    oracleId: raw.oracleId,
    latestLedger: raw.latestLedger,
    fetchedAt: now.toISOString(),
    reserves,
    totals: poolTotals(reserves),
    oracle,
    maxAbsGapPct,
    badDebt: buildBadDebt(raw, reserves),
    backstop: raw.backstop,
    stress,
    warnings,
  };
}

export async function buildNetworkReport(
  net: NetworkName,
  deps: MonitorDeps,
  t: Thresholds = thresholds(),
): Promise<{ report: NetworkReport; raws: RawPool[] }> {
  const { ids, error } = await deps.discoverPools(net);
  const settled = await Promise.allSettled(ids.map((id) => deps.loadPool(net, id)));
  const raws: RawPool[] = [];
  const failedPools: NetworkReport["failedPools"] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") raws.push(s.value);
    else failedPools.push({ poolId: ids[i], error: String((s.reason as Error)?.message ?? s.reason) });
  });

  const codes = raws.flatMap((r) => r.reserves.map((x) => referenceCode(x.code))).filter((c): c is string => !!c);
  let refs: Record<string, ReferencePrice[]> = {};
  try {
    refs = codes.length ? await deps.referencePrices(net, codes) : {};
  } catch {
    refs = {};
  }

  const now = deps.now();
  const pools = raws.map((raw) => buildPoolReport(net, raw, refs, t, now));
  pools.sort((a, b) => (b.totals.suppliedUsd ?? -1) - (a.totals.suppliedUsd ?? -1));
  return {
    report: { network: net, fetchedAt: now.toISOString(), pools, failedPools, discoveryError: error },
    raws,
  };
}
