import { CODE_ALIASES, type Thresholds } from "./config";
import type {
  BadDebtReport,
  Maybe,
  OracleCheck,
  RawPool,
  ReferencePrice,
  ReserveReport,
  Severity,
  StressBucket,
} from "./types";

/** Pool status codes from the Blend V2 pool contract. Even codes are set by the admin. */
export function statusLabel(status: number): string {
  const labels: Record<number, string> = {
    0: "Active (admin)",
    1: "Active",
    2: "On ice (admin)",
    3: "On ice",
    4: "Frozen (admin)",
    5: "Frozen",
    6: "Setup",
  };
  return `${labels[status] ?? "Unknown"} · code ${status}`;
}

export function referenceCode(code: Maybe<string>): Maybe<string> {
  if (!code) return null;
  return CODE_ALIASES[code] ?? CODE_ALIASES[code.toUpperCase()] ?? null;
}

export function gapPct(oracle: number, reference: number): Maybe<number> {
  if (!Number.isFinite(oracle) || !Number.isFinite(reference) || reference <= 0) return null;
  return ((oracle - reference) / reference) * 100;
}

/** Signed gap with the largest absolute size across all references that returned a price. */
export function largestGap(oracle: Maybe<number>, refs: ReferencePrice[]): Maybe<number> {
  if (oracle == null) return null;
  let best: Maybe<number> = null;
  for (const r of refs) {
    if (r.price == null) continue;
    const g = gapPct(oracle, r.price);
    if (g == null) continue;
    if (best == null || Math.abs(g) > Math.abs(best)) best = g;
  }
  return best;
}

export function gapSeverity(gap: Maybe<number>, stale: boolean, t: Thresholds): Severity {
  if (gap == null) return stale ? "warn" : "unavailable";
  const a = Math.abs(gap);
  if (a >= t.gapCritPct) return "critical";
  if (a >= t.gapWarnPct || stale) return "warn";
  return "ok";
}

export function utilSeverity(u: Maybe<number>, t: Thresholds): Severity {
  if (u == null) return "unavailable";
  if (u >= t.utilCrit) return "critical";
  if (u >= t.utilWarn) return "warn";
  return "ok";
}

export function buildReserves(raw: RawPool, nowSec: number): ReserveReport[] {
  return raw.reserves.map((r) => {
    const p = raw.oraclePrices[r.assetId] ?? null;
    return {
      assetId: r.assetId,
      code: r.code,
      supplied: r.supplied,
      borrowed: r.borrowed,
      utilisation: r.utilisation,
      maxUtil: r.maxUtil,
      supplyApr: r.supplyApr,
      borrowApr: r.borrowApr,
      cFactor: r.cFactor,
      lFactor: r.lFactor,
      oraclePrice: p ? p.price : null,
      oracleAgeSec: p ? Math.max(0, nowSec - p.timestamp) : null,
      suppliedUsd: p ? r.supplied * p.price : null,
      borrowedUsd: p ? r.borrowed * p.price : null,
    };
  });
}

/** Totals in USD are only shown if every reserve has an oracle price; otherwise unavailable. */
export function poolTotals(reserves: ReserveReport[]) {
  if (reserves.length === 0) return { suppliedUsd: null, borrowedUsd: null, utilisation: null };
  if (reserves.some((r) => r.suppliedUsd == null || r.borrowedUsd == null)) {
    return { suppliedUsd: null, borrowedUsd: null, utilisation: null };
  }
  const s = reserves.reduce((a, r) => a + (r.suppliedUsd as number), 0);
  const b = reserves.reduce((a, r) => a + (r.borrowedUsd as number), 0);
  return { suppliedUsd: s, borrowedUsd: b, utilisation: s > 0 ? b / s : null };
}

export function buildOracleChecks(
  reserves: ReserveReport[],
  refsByCode: Record<string, ReferencePrice[]>,
  t: Thresholds,
): OracleCheck[] {
  return reserves.map((r) => {
    const code = referenceCode(r.code);
    const refs = code ? refsByCode[code] ?? [] : [];
    const stale = r.oracleAgeSec != null && r.oracleAgeSec > t.oracleStaleSec;
    const gap = largestGap(r.oraclePrice, refs);
    return {
      assetId: r.assetId,
      code: r.code,
      oraclePrice: r.oraclePrice,
      oracleAgeSec: r.oracleAgeSec,
      references: refs,
      gapPct: gap,
      stale,
      severity: r.oraclePrice == null ? "unavailable" : gapSeverity(gap, stale, t),
    };
  });
}

export function buildBadDebt(raw: RawPool, reserves: ReserveReport[]): BadDebtReport {
  if (raw.backstopLiabilities == null) return { totalUsd: null, byAsset: [] };
  const byAsset = Object.entries(raw.backstopLiabilities)
    .filter(([, amount]) => amount > 0)
    .map(([assetId, amount]) => {
      const r = reserves.find((x) => x.assetId === assetId);
      const usd = r?.oraclePrice != null ? amount * r.oraclePrice : null;
      return { assetId, code: r?.code ?? null, amount, usd };
    });
  const totalUsd = byAsset.some((b) => b.usd == null) ? null : byAsset.reduce((a, b) => a + (b.usd as number), 0);
  return { totalUsd, byAsset };
}

export const STRESS_BANDS: { label: string; min: number; max: number }[] = [
  { label: "HF below 1.00 (liquidatable)", min: 0, max: 1.0 },
  { label: "HF 1.00 – 1.05", min: 1.0, max: 1.05 },
  { label: "HF 1.05 – 1.10", min: 1.05, max: 1.1 },
  { label: "HF 1.10 – 1.25", min: 1.1, max: 1.25 },
];

/** Health factor = effective collateral / effective liabilities (Blend liquidates below 1). */
export function healthFactor(effCollateral: number, effLiabilities: number): Maybe<number> {
  if (!(effLiabilities > 0)) return null;
  return effCollateral / effLiabilities;
}

/** Aggregates positions into bands. Takes numbers only, never addresses. */
export function bucketPositions(positions: { hf: number; liabilitiesUsd: number }[]): StressBucket[] {
  return STRESS_BANDS.map((b) => {
    const inBand = positions.filter((p) => p.hf >= b.min && p.hf < b.max);
    return {
      ...b,
      count: inBand.length,
      liabilitiesUsd: inBand.reduce((a, p) => a + p.liabilitiesUsd, 0),
    };
  });
}

export function worstSeverity(list: Severity[]): Severity {
  const order: Severity[] = ["critical", "warn", "ok", "unavailable"];
  for (const s of order) if (list.includes(s)) return s;
  return "unavailable";
}
