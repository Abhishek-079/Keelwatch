import Link from "next/link";
import { parseNetwork } from "@/lib/config";
import { safeNetworkReport } from "@/lib/data";
import { getHistory, getSql, type HistoryPoint } from "@/lib/db";
import { age, amount, explorer, pct, price, shortId, signedPct, usd } from "@/lib/format";
import { ErrorNotice, PageHead, Pill, Stat, Val } from "../../components/ui";
import { LineChart } from "../../components/LineChart";

export const dynamic = "force-dynamic";

export default async function PoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ network?: string }>;
}) {
  const { id } = await params;
  const network = parseNetwork((await searchParams).network);
  const { report, error } = await safeNetworkReport(network);
  const p = report?.pools.find((x) => x.poolId === id);
  const failed = report?.failedPools.find((x) => x.poolId === id);

  const sql = getSql();
  let history: HistoryPoint[] = [];
  let historyError: string | null = null;
  if (sql) {
    try {
      history = await getHistory(sql, network, id, 30);
    } catch (e) {
      historyError = (e as Error).message;
    }
  }

  if (!p) {
    return (
      <>
        <PageHead title="Pool" network={network} />
        {error && <ErrorNotice error={error} />}
        {failed && <ErrorNotice error={failed.error} />}
        {!error && !failed && <p>This pool is not in the watched list for {network}. <Link href={`/pools?network=${network}`}>Back to pools</Link></p>}
        <p className="mono small">{id}</p>
      </>
    );
  }

  const nearBuckets = p.stress?.buckets.filter((b) => b.max <= 1.1) ?? [];
  return (
    <>
      <PageHead title={p.name} network={network}>
        <span className="mono small breakall"><a href={explorer(network, p.poolId)}>{p.poolId}</a></span> · {p.statusLabel} · ledger {p.latestLedger}
      </PageHead>
      {p.warnings.map((w) => <div key={w} className="notice">{w}</div>)}

      <div className="grid">
        <Stat label="Supplied" value={usd(p.totals.suppliedUsd)} />
        <Stat label="Borrowed" value={usd(p.totals.borrowedUsd)} />
        <Stat label="Utilisation" value={pct(p.totals.utilisation, 1, true)} hint="borrowed ÷ supplied, in USD" />
        <Stat label="Bad debt" value={p.badDebt.byAsset.length === 0 && p.badDebt.totalUsd != null ? "$0" : usd(p.badDebt.totalUsd)} hint="held by the backstop" />
        <Stat label="Backstop value" value={usd(p.backstop?.totalSpotValueUsd)} hint={p.backstop ? `${pct(p.backstop.q4wPct)} queued to withdraw` : undefined} />
      </div>

      <h2>Reserves</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Asset</th><th className="num">Supplied</th><th className="num">Borrowed</th><th className="num">Utilisation</th>
              <th className="num">Max util.</th><th className="num">Supply APR</th><th className="num">Borrow APR</th>
              <th className="num">Collateral factor</th><th className="num">Supplied (USD)</th>
            </tr>
          </thead>
          <tbody>
            {p.reserves.map((r) => (
              <tr key={r.assetId}>
                <td><strong>{r.code ?? "?"}</strong> <span className="mono small muted">{shortId(r.assetId)}</span></td>
                <td className="num">{amount(r.supplied)}</td>
                <td className="num">{amount(r.borrowed)}</td>
                <td className="num">{pct(r.utilisation, 1, true)}</td>
                <td className="num">{pct(r.maxUtil, 0, true)}</td>
                <td className="num">{pct(r.supplyApr, 2, true)}</td>
                <td className="num">{pct(r.borrowApr, 2, true)}</td>
                <td className="num">{pct(r.cFactor, 0, true)}</td>
                <td className="num"><Val v={usd(r.suppliedUsd)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Oracle watch</h2>
      <p className="muted small">
        Oracle: <a className="mono" href={explorer(network, p.oracleId)}>{shortId(p.oracleId)}</a>. Gap = (pool oracle −
        reference) ÷ reference. The largest gap across available references is shown.
      </p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr><th>Asset</th><th className="num">Pool oracle</th><th>Updated</th><th className="num">Reflector (exchanges)</th><th className="num">CoinGecko</th><th className="num">Gap</th><th>Status</th></tr>
          </thead>
          <tbody>
            {p.oracle.map((o) => {
              const ref = (s: string) => o.references.find((r) => r.source === s);
              return (
                <tr key={o.assetId}>
                  <td><strong>{o.code ?? "?"}</strong></td>
                  <td className="num"><Val v={price(o.oraclePrice)} /></td>
                  <td className="small">{o.stale ? <Pill s="warn">stale · {age(o.oracleAgeSec)}</Pill> : <Val v={age(o.oracleAgeSec)} />}</td>
                  <td className="num" title={ref("reflector-cex")?.error}><Val v={price(ref("reflector-cex")?.price)} /></td>
                  <td className="num" title={ref("coingecko")?.error}><Val v={price(ref("coingecko")?.price)} /></td>
                  <td className="num"><Val v={signedPct(o.gapPct)} /></td>
                  <td><Pill s={o.severity} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Bad debt</h2>
      {p.badDebt.totalUsd == null && p.badDebt.byAsset.length === 0 ? (
        <p className="na">unavailable</p>
      ) : p.badDebt.byAsset.length === 0 ? (
        <p>None. The backstop holds no debt in this pool.</p>
      ) : (
        <ul className="clean">
          {p.badDebt.byAsset.map((b) => (
            <li key={b.assetId}><strong>{b.code ?? shortId(b.assetId)}</strong>: {amount(b.amount)} (<Val v={usd(b.usd)} />)</li>
          ))}
        </ul>
      )}

      <h2>Stress: positions near liquidation</h2>
      {!p.stress ? (
        <p className="na">unavailable — needs the database and at least one scheduled snapshot run.</p>
      ) : (
        <>
          <p className="muted small">
            Totals only; no individual accounts are shown or exposed. Health factor (HF) = effective collateral ÷
            effective debt; Blend can liquidate below 1. Computed {new Date(p.stress.computedAt).toUTCString()} from{" "}
            {p.stress.trackedAccounts} tracked accounts ({p.stress.accountsWithDebt} with debt).
          </p>
          <div className="notice info small">{p.stress.note}</div>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Band</th><th className="num">Positions</th><th className="num">Debt (USD)</th></tr></thead>
              <tbody>
                {p.stress.buckets.map((b) => (
                  <tr key={b.label}><td>{b.label}</td><td className="num">{b.count}</td><td className="num">{usd(b.liabilitiesUsd)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small">Below HF 1.10: <strong>{nearBuckets.reduce((a, b) => a + b.count, 0)}</strong> positions, <strong>{usd(nearBuckets.reduce((a, b) => a + b.liabilitiesUsd, 0))}</strong> of debt.</p>
        </>
      )}

      <h2>History (30 days)</h2>
      {!sql && <p className="na">unavailable — database not configured.</p>}
      {historyError && <ErrorNotice error={historyError} />}
      {sql && !historyError && (
        <div className="split">
          <LineChart title="Supplied (USD)" points={history.map((h) => ({ t: h.t, v: h.supplied_usd }))} format={(n) => usd(n)} />
          <LineChart title="Utilisation" points={history.map((h) => ({ t: h.t, v: h.utilisation }))} format={(n) => pct(n, 1, true)} color="var(--chart-2)" />
          <LineChart title="Largest oracle gap (%)" points={history.map((h) => ({ t: h.t, v: h.max_abs_gap_pct }))} format={(n) => signedPct(n)} color="var(--chart-2)" />
          <LineChart title="Debt below HF 1.10 (USD)" points={history.map((h) => ({ t: h.t, v: h.stress_liab_usd }))} format={(n) => usd(n)} />
        </div>
      )}
      <p className="small"><Link href={`/stats?network=${network}&pool=${p.poolId}`}>More charts →</Link> · <Link href={`/api/v1/pools/${p.poolId}?network=${network}`}>This pool as JSON</Link></p>
    </>
  );
}
