// Server-side only. Live data access with a short in-memory cache.
import type { PoolV2 } from "@blend-capital/blend-sdk";
import { LIMITS, type NetworkName } from "./config";
import { getSql, latestStress } from "./db";
import { buildNetworkReport, type MonitorDeps } from "./monitor";
import { discoverPools, loadRawPool } from "./sources/blend";
import { referencePrices } from "./sources/reference";
import type { NetworkReport } from "./types";

export function liveDeps(poolObjects?: Map<string, PoolV2>): MonitorDeps {
  return {
    discoverPools,
    loadPool: async (net, id) => {
      const { raw, pool } = await loadRawPool(net, id);
      poolObjects?.set(id, pool);
      return raw;
    },
    referencePrices,
    now: () => new Date(),
  };
}

type Entry = { at: number; value: Promise<NetworkReport> };
const cache = new Map<NetworkName, Entry>();

/** Live report, cached for CACHE_SECONDS, with the latest stress view (from the database) attached. */
export async function getNetworkReport(net: NetworkName): Promise<NetworkReport> {
  const hit = cache.get(net);
  if (hit && Date.now() - hit.at < LIMITS.cacheSeconds * 1000) return hit.value;
  const value = (async () => {
    const { report } = await buildNetworkReport(net, liveDeps());
    const sql = getSql();
    if (sql) {
      try {
        const stress = await latestStress(sql, net);
        for (const p of report.pools) p.stress = stress[p.poolId] ?? null;
      } catch {
        /* stress stays null = unavailable */
      }
    }
    return report;
  })();
  cache.set(net, { at: Date.now(), value });
  value.catch(() => cache.delete(net));
  return value;
}

export async function safeNetworkReport(net: NetworkName): Promise<{ report: NetworkReport | null; error: string | null }> {
  try {
    const report = await getNetworkReport(net);
    if (report.pools.length === 0 && (report.failedPools.length > 0 || report.discoveryError)) {
      const first = report.failedPools[0]?.error ?? report.discoveryError;
      return { report, error: `No pool could be read (${first}).` };
    }
    return { report, error: null };
  } catch (e) {
    return { report: null, error: (e as Error).message };
  }
}
