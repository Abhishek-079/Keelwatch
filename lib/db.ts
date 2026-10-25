// Server-side only. Neon Postgres over HTTP. If DATABASE_URL is missing, every function
// reports "not configured" and the app still works for live data.
import { neon } from "@neondatabase/serverless";
import type { NetworkName } from "./config";
import type { PoolReport, StressReport } from "./types";

export interface Sql {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]>;
  query(text: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
}

let cached: Sql | null | undefined;

export function getSql(): Sql | null {
  if (cached !== undefined) return cached;
  const url = process.env.DATABASE_URL;
  cached = url ? (neon(url) as unknown as Sql) : null;
  return cached;
}

/** Only for tests. */
export function setSqlForTests(sql: Sql | null) {
  cached = sql;
}

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS snapshots (
     id BIGSERIAL PRIMARY KEY,
     network TEXT NOT NULL,
     pool_id TEXT NOT NULL,
     pool_name TEXT,
     taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     supplied_usd DOUBLE PRECISION,
     borrowed_usd DOUBLE PRECISION,
     utilisation DOUBLE PRECISION,
     bad_debt_usd DOUBLE PRECISION,
     max_abs_gap_pct DOUBLE PRECISION,
     backstop_usd DOUBLE PRECISION,
     q4w_pct DOUBLE PRECISION,
     stress_count INTEGER,
     stress_liab_usd DOUBLE PRECISION,
     report JSONB NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS snapshots_pool_time ON snapshots (network, pool_id, taken_at DESC)`,
  `CREATE TABLE IF NOT EXISTS tracked_accounts (
     network TEXT NOT NULL,
     pool_id TEXT NOT NULL,
     address TEXT NOT NULL,
     last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (network, pool_id, address)
   )`,
  `CREATE TABLE IF NOT EXISTS indexer_cursor (
     network TEXT NOT NULL,
     pool_id TEXT NOT NULL,
     next_ledger INTEGER NOT NULL,
     oldest_ledger_seen INTEGER,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (network, pool_id)
   )`,
  `CREATE TABLE IF NOT EXISTS alert_state (
     key TEXT PRIMARY KEY,
     active BOOLEAN NOT NULL,
     severity TEXT NOT NULL,
     last_sent_at TIMESTAMPTZ,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS alert_log (
     id BIGSERIAL PRIMARY KEY,
     key TEXT NOT NULL,
     network TEXT NOT NULL,
     pool_id TEXT NOT NULL,
     rule TEXT NOT NULL,
     severity TEXT NOT NULL,
     message TEXT NOT NULL,
     resolved BOOLEAN NOT NULL DEFAULT false,
     channels TEXT NOT NULL DEFAULT '',
     sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS alert_log_time ON alert_log (sent_at DESC)`,
];

export async function migrate(sql: Sql) {
  for (const stmt of SCHEMA) await sql.query(stmt);
}

export async function saveSnapshot(sql: Sql, p: PoolReport) {
  const stressCount = p.stress ? p.stress.buckets.filter((b) => b.max <= 1.1).reduce((a, b) => a + b.count, 0) : null;
  const stressLiab = p.stress
    ? p.stress.buckets.filter((b) => b.max <= 1.1).reduce((a, b) => a + b.liabilitiesUsd, 0)
    : null;
  await sql`INSERT INTO snapshots (network, pool_id, pool_name, supplied_usd, borrowed_usd, utilisation,
      bad_debt_usd, max_abs_gap_pct, backstop_usd, q4w_pct, stress_count, stress_liab_usd, report)
    VALUES (${p.network}, ${p.poolId}, ${p.name}, ${p.totals.suppliedUsd}, ${p.totals.borrowedUsd},
      ${p.totals.utilisation}, ${p.badDebt.totalUsd}, ${p.maxAbsGapPct}, ${p.backstop?.totalSpotValueUsd ?? null},
      ${p.backstop?.q4wPct ?? null}, ${stressCount}, ${stressLiab}, ${JSON.stringify(p)})`;
}

export const HISTORY_METRICS = [
  "supplied_usd",
  "borrowed_usd",
  "utilisation",
  "bad_debt_usd",
  "max_abs_gap_pct",
  "backstop_usd",
  "q4w_pct",
  "stress_count",
  "stress_liab_usd",
] as const;
export type HistoryMetric = (typeof HISTORY_METRICS)[number];

export interface HistoryPoint {
  t: string;
  supplied_usd: number | null;
  borrowed_usd: number | null;
  utilisation: number | null;
  bad_debt_usd: number | null;
  max_abs_gap_pct: number | null;
  backstop_usd: number | null;
  q4w_pct: number | null;
  stress_count: number | null;
  stress_liab_usd: number | null;
}

export async function getHistory(sql: Sql, net: NetworkName, poolId: string, days: number): Promise<HistoryPoint[]> {
  const rows = await sql`SELECT taken_at, supplied_usd, borrowed_usd, utilisation, bad_debt_usd, max_abs_gap_pct,
      backstop_usd, q4w_pct, stress_count, stress_liab_usd
    FROM snapshots WHERE network = ${net} AND pool_id = ${poolId}
      AND taken_at > now() - (${days} || ' days')::interval
    ORDER BY taken_at ASC LIMIT 5000`;
  return rows.map((r) => ({
    t: new Date(r.taken_at as string).toISOString(),
    supplied_usd: r.supplied_usd as number | null,
    borrowed_usd: r.borrowed_usd as number | null,
    utilisation: r.utilisation as number | null,
    bad_debt_usd: r.bad_debt_usd as number | null,
    max_abs_gap_pct: r.max_abs_gap_pct as number | null,
    backstop_usd: r.backstop_usd as number | null,
    q4w_pct: r.q4w_pct as number | null,
    stress_count: r.stress_count as number | null,
    stress_liab_usd: r.stress_liab_usd as number | null,
  }));
}

export async function latestStress(sql: Sql, net: NetworkName): Promise<Record<string, StressReport>> {
  const rows = await sql`SELECT DISTINCT ON (pool_id) pool_id, report->'stress' AS stress
    FROM snapshots WHERE network = ${net} AND report->'stress' IS NOT NULL
      AND jsonb_typeof(report->'stress') = 'object'
    ORDER BY pool_id, taken_at DESC`;
  const out: Record<string, StressReport> = {};
  for (const r of rows) out[r.pool_id as string] = r.stress as StressReport;
  return out;
}

export async function recentAlerts(sql: Sql, net: NetworkName | null, limit = 50) {
  const rows = net
    ? await sql`SELECT rule, network, pool_id, severity, message, resolved, sent_at FROM alert_log
        WHERE network = ${net} ORDER BY sent_at DESC LIMIT ${limit}`
    : await sql`SELECT rule, network, pool_id, severity, message, resolved, sent_at FROM alert_log
        ORDER BY sent_at DESC LIMIT ${limit}`;
  return rows.map((r) => ({
    rule: r.rule as string,
    network: r.network as string,
    poolId: r.pool_id as string,
    severity: r.severity as string,
    message: r.message as string,
    resolved: r.resolved as boolean,
    sentAt: new Date(r.sent_at as string).toISOString(),
  }));
}

export async function pruneOld(sql: Sql, days = 90) {
  await sql`DELETE FROM snapshots WHERE taken_at < now() - (${days} || ' days')::interval`;
  await sql`DELETE FROM tracked_accounts WHERE last_seen < now() - (${days} || ' days')::interval`;
}

export async function historyPools(sql: Sql, net: NetworkName) {
  const rows = await sql`SELECT DISTINCT ON (pool_id) pool_id, pool_name, supplied_usd FROM snapshots
    WHERE network = ${net} ORDER BY pool_id, taken_at DESC`;
  return rows
    .map((r) => ({ poolId: r.pool_id as string, name: (r.pool_name as string) || (r.pool_id as string), suppliedUsd: r.supplied_usd as number | null }))
    .sort((a, b) => (b.suppliedUsd ?? -1) - (a.suppliedUsd ?? -1));
}

export async function snapshotCount(sql: Sql, net: NetworkName) {
  const rows = await sql`SELECT count(*)::int AS n, min(taken_at) AS first, max(taken_at) AS last FROM snapshots WHERE network = ${net}`;
  const r = rows[0] ?? {};
  return {
    count: Number(r.n ?? 0),
    first: r.first ? new Date(r.first as string).toISOString() : null,
    last: r.last ? new Date(r.last as string).toISOString() : null,
  };
}
