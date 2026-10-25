// Server-side only. The scheduled job: read every pool, compute stress, save history, send alerts.
import type { PoolV2 } from "@blend-capital/blend-sdk";
import { LIMITS, NETWORKS, thresholds, type NetworkName } from "./config";
import { getSql, migrate, pruneOld, saveSnapshot, type Sql } from "./db";
import { buildNetworkReport } from "./monitor";
import { bucketPositions } from "./risk";
import { computeHealthFactors, discoverAccounts } from "./sources/blend";
import { evaluatePool } from "./alerts/rules";
import { runAlerts } from "./alerts/dispatch";
import { liveDeps } from "./data";
import type { StressReport } from "./types";

function listEnv(name: string, fallback: NetworkName[]): NetworkName[] {
  const v = process.env[name];
  if (!v) return fallback;
  return v.split(",").map((s) => s.trim()).filter((s): s is NetworkName => NETWORKS.includes(s as NetworkName));
}

async function stressFor(sql: Sql, net: NetworkName, pool: PoolV2): Promise<StressReport> {
  const cur = await sql`SELECT next_ledger, oldest_ledger_seen FROM indexer_cursor WHERE network = ${net} AND pool_id = ${pool.id}`;
  const start = cur[0] ? Number(cur[0].next_ledger) : null;
  const found = await discoverAccounts(net, pool.id, start);
  for (const a of found.accounts) {
    await sql`INSERT INTO tracked_accounts (network, pool_id, address) VALUES (${net}, ${pool.id}, ${a})
      ON CONFLICT (network, pool_id, address) DO UPDATE SET last_seen = now()`;
  }
  const oldestSeen = cur[0]?.oldest_ledger_seen != null ? Math.min(Number(cur[0].oldest_ledger_seen), found.oldestLedger) : found.oldestLedger;
  await sql`INSERT INTO indexer_cursor (network, pool_id, next_ledger, oldest_ledger_seen) VALUES (${net}, ${pool.id}, ${found.nextLedger}, ${oldestSeen})
    ON CONFLICT (network, pool_id) DO UPDATE SET next_ledger = EXCLUDED.next_ledger,
      oldest_ledger_seen = LEAST(indexer_cursor.oldest_ledger_seen, EXCLUDED.oldest_ledger_seen), updated_at = now()`;

  const rows = await sql`SELECT address FROM tracked_accounts WHERE network = ${net} AND pool_id = ${pool.id}
    ORDER BY last_seen DESC LIMIT ${LIMITS.maxTrackedAccountsPerPool}`;
  const accounts = rows.map((r) => r.address as string);
  const hfs = await computeHealthFactors(net, pool, accounts);
  return {
    computedAt: new Date().toISOString(),
    trackedAccounts: accounts.length,
    accountsWithDebt: hfs.length,
    buckets: bucketPositions(hfs),
    note: `Partial coverage: only accounts that borrowed or posted collateral since ledger ${oldestSeen} are tracked. Accounts inactive since before then are not counted.`,
  };
}

export async function runSnapshot(opts: { networks?: NetworkName[] } = {}) {
  const sql = getSql();
  const t = thresholds();
  const networks = opts.networks ?? listEnv("SNAPSHOT_NETWORKS", ["mainnet", "testnet"]);
  const alertNetworks = listEnv("ALERT_NETWORKS", ["mainnet"]);
  const summary: Record<string, unknown> = { database: !!sql };
  if (sql) await migrate(sql);

  for (const net of networks) {
    const poolObjects = new Map<string, PoolV2>();
    const netSummary: Record<string, unknown> = {};
    try {
      const { report } = await buildNetworkReport(net, liveDeps(poolObjects), t);
      netSummary.pools = report.pools.length;
      netSummary.failedPools = report.failedPools;
      netSummary.discoveryError = report.discoveryError;
      if (sql) {
        for (const p of report.pools) {
          const obj = poolObjects.get(p.poolId);
          if (obj) {
            try {
              p.stress = await stressFor(sql, net, obj);
            } catch (e) {
              p.warnings.push(`Stress view failed: ${(e as Error).message}`);
            }
          }
          await saveSnapshot(sql, p);
        }
        if (alertNetworks.includes(net)) {
          const candidates = report.pools.flatMap((p) => evaluatePool(p, t));
          const prefixes = report.pools.map((p) => `${net}:${p.poolId}:`);
          netSummary.alerts = await runAlerts(sql, candidates, prefixes, t);
        }
      }
    } catch (e) {
      netSummary.error = (e as Error).message;
    }
    summary[net] = netSummary;
  }
  if (sql) await pruneOld(sql, Number(process.env.HISTORY_DAYS || 90));
  return summary;
}
