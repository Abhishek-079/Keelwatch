import type { Thresholds } from "../config";
import type { PoolReport } from "../types";

export type AlertSeverity = "warn" | "critical";

export interface AlertCandidate {
  key: string; // network:pool:rule[:asset]
  rule: string;
  network: string;
  poolId: string;
  poolName: string;
  severity: AlertSeverity;
  message: string;
}

const fmtPct = (n: number, d = 1) => `${n.toFixed(d)}%`;
const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const short = (id: string) => `${id.slice(0, 4)}…${id.slice(-4)}`;

/** Turns one pool report into the list of alert conditions that are currently true. */
export function evaluatePool(p: PoolReport, t: Thresholds): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const base = { network: p.network, poolId: p.poolId, poolName: p.name };
  const k = (rule: string, sub?: string) => [p.network, p.poolId, rule, sub].filter(Boolean).join(":");

  for (const r of p.reserves) {
    const label = r.code ?? short(r.assetId);
    if (r.utilisation >= t.utilWarn) {
      out.push({
        ...base,
        key: k("utilisation", r.assetId),
        rule: "utilisation",
        severity: r.utilisation >= t.utilCrit ? "critical" : "warn",
        message: `${label} utilisation is ${fmtPct(r.utilisation * 100)} (alert at ${fmtPct(t.utilWarn * 100, 0)}). Lenders may not be able to withdraw.`,
      });
    }
  }

  for (const o of p.oracle) {
    const label = o.code ?? short(o.assetId);
    if (o.gapPct != null && Math.abs(o.gapPct) >= t.gapWarnPct && p.network === "mainnet") {
      const refs = o.references.filter((r) => r.price != null).map((r) => r.source).join(", ");
      out.push({
        ...base,
        key: k("oracle_gap", o.assetId),
        rule: "oracle_gap",
        severity: Math.abs(o.gapPct) >= t.gapCritPct ? "critical" : "warn",
        message: `${label} oracle price ${o.oraclePrice?.toPrecision(6)} differs from reference (${refs}) by ${fmtPct(o.gapPct, 2)}.`,
      });
    }
    if (o.stale && o.oracleAgeSec != null) {
      out.push({
        ...base,
        key: k("oracle_stale", o.assetId),
        rule: "oracle_stale",
        severity: "warn",
        message: `${label} oracle price is ${Math.round(o.oracleAgeSec / 60)} minutes old (alert after ${Math.round(t.oracleStaleSec / 60)}).`,
      });
    }
  }

  if (p.badDebt.byAsset.length > 0) {
    const total = p.badDebt.totalUsd;
    if (total == null || total >= t.badDebtUsdWarn) {
      out.push({
        ...base,
        key: k("bad_debt"),
        rule: "bad_debt",
        severity: "critical",
        message:
          total == null
            ? `Bad debt is present (${p.badDebt.byAsset.map((b) => b.code ?? short(b.assetId)).join(", ")}); USD value unavailable.`
            : `Bad debt held by the backstop: ${fmtUsd(total)}.`,
      });
    }
  }

  if (p.stress) {
    const near = p.stress.buckets.filter((b) => b.max <= 1.1);
    const liab = near.reduce((a, b) => a + b.liabilitiesUsd, 0);
    const count = near.reduce((a, b) => a + b.count, 0);
    const under1 = p.stress.buckets.find((b) => b.max <= 1.0);
    if (liab >= t.stressLiabUsdWarn) {
      out.push({
        ...base,
        key: k("stress"),
        rule: "stress",
        severity: under1 && under1.liabilitiesUsd >= t.stressLiabUsdWarn ? "critical" : "warn",
        message: `${count} tracked position(s) with health factor below 1.10 hold ${fmtUsd(liab)} of debt.`,
      });
    }
  }

  if (p.backstop && p.backstop.q4wPct >= t.q4wWarnPct) {
    out.push({
      ...base,
      key: k("backstop_q4w"),
      rule: "backstop_q4w",
      severity: "warn",
      message: `${fmtPct(p.backstop.q4wPct)} of the backstop is queued for withdrawal (alert at ${fmtPct(t.q4wWarnPct, 0)}).`,
    });
  }

  if (p.status >= 2 && p.status <= 5) {
    out.push({
      ...base,
      key: k("pool_status"),
      rule: "pool_status",
      severity: p.status >= 4 ? "critical" : "warn",
      message: `Pool status changed to ${p.statusLabel}.`,
    });
  }

  return out;
}
