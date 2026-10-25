import { parseNetwork } from "@/lib/config";
import { getHistory, getSql, historyPools, snapshotCount, type HistoryPoint } from "@/lib/db";
import { pct, shortId, signedPct, usd } from "@/lib/format";
import { ErrorNotice, PageHead, Stat } from "../components/ui";
import { LineChart } from "../components/LineChart";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stats" };

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ network?: string; pool?: string; days?: string }> }) {
  const sp = await searchParams;
  const network = parseNetwork(sp.network);
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const sql = getSql();

  if (!sql) {
    return (
      <>
        <PageHead title="Stats" network={network} path="/stats" />
        <p className="na">History is unavailable: the database is not configured (set DATABASE_URL). Live pages still work.</p>
      </>
    );
  }

  let pools: Awaited<ReturnType<typeof historyPools>> = [];
  let counts: Awaited<ReturnType<typeof snapshotCount>> | null = null;
  let history: HistoryPoint[] = [];
  let error: string | null = null;
  let poolId = sp.pool ?? "";
  try {
    [pools, counts] = await Promise.all([historyPools(sql, network), snapshotCount(sql, network)]);
    if (!pools.find((p) => p.poolId === poolId)) poolId = pools[0]?.poolId ?? "";
    if (poolId) history = await getHistory(sql, network, poolId, days);
  } catch (e) {
    error = (e as Error).message;
  }
  const series = (k: keyof Omit<HistoryPoint, "t">) => history.map((h) => ({ t: h.t, v: h[k] as number | null }));

  return (
    <>
      <PageHead title="Stats" network={network} path="/stats">
        Trends from scheduled snapshots stored in the database. Gaps in a line mean that value could not be read at that time.
      </PageHead>
      {error && <ErrorNotice error={error} />}
      {counts && (
        <div className="grid">
          <Stat label="Snapshots stored" value={String(counts.count)} />
          <Stat label="First snapshot" value={counts.first ? new Date(counts.first).toLocaleDateString("en-GB") : "unavailable"} />
          <Stat label="Latest snapshot" value={counts.last ? new Date(counts.last).toUTCString().slice(5, 22) : "unavailable"} hint="UTC" />
        </div>
      )}

      {pools.length === 0 ? (
        <p className="na" style={{ marginTop: 20 }}>No snapshots yet for {network}. They appear after the scheduled job runs (see README, step 9).</p>
      ) : (
        <>
          <form className="inline" method="get" style={{ margin: "22px 0 14px" }}>
            <input type="hidden" name="network" value={network} />
            <label className="small muted" htmlFor="pool">Pool</label>
            <select id="pool" name="pool" defaultValue={poolId}>
              {pools.map((p) => <option key={p.poolId} value={p.poolId}>{p.name} ({shortId(p.poolId)})</option>)}
            </select>
            <select name="days" defaultValue={String(days)} aria-label="Time range">
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
            <button className="btn" type="submit">Show</button>
          </form>
          <div className="split">
            <LineChart title="Supplied (USD)" points={series("supplied_usd")} format={(n) => usd(n)} />
            <LineChart title="Borrowed (USD)" points={series("borrowed_usd")} format={(n) => usd(n)} color="var(--chart-2)" />
            <LineChart title="Utilisation" points={series("utilisation")} format={(n) => pct(n, 1, true)} />
            <LineChart title="Largest oracle gap (%)" points={series("max_abs_gap_pct")} format={(n) => signedPct(n)} color="var(--chart-2)" />
            <LineChart title="Bad debt (USD)" points={series("bad_debt_usd")} format={(n) => usd(n)} />
            <LineChart title="Backstop value (USD)" points={series("backstop_usd")} format={(n) => usd(n)} color="var(--chart-2)" />
            <LineChart title="Backstop queued to withdraw (%)" points={series("q4w_pct")} format={(n) => pct(n)} />
            <LineChart title="Debt below HF 1.10 (USD)" points={series("stress_liab_usd")} format={(n) => usd(n)} color="var(--chart-2)" />
          </div>
          <p className="small muted">Download: <a href={`/api/v1/history?network=${network}&pool=${poolId}&days=${days}`}>this history as JSON</a></p>
        </>
      )}
    </>
  );
}
