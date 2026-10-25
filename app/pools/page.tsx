import Link from "next/link";
import { parseNetwork } from "@/lib/config";
import { safeNetworkReport } from "@/lib/data";
import { pct, shortId, signedPct, usd } from "@/lib/format";
import { gapSeverity, statusPlain, utilSeverity, worstSeverity } from "@/lib/risk";
import { thresholds } from "@/lib/config";
import { SITE } from "@/lib/site";
import { ErrorNotice, PageHead, Pill, Val } from "../components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pools" };

export default async function PoolsPage({ searchParams }: { searchParams: Promise<{ network?: string }> }) {
  const network = parseNetwork((await searchParams).network);
  const { report, error } = await safeNetworkReport(network);
  const t = thresholds();
  const overallOf = (p: NonNullable<typeof report>["pools"][number]) =>
    worstSeverity([
      utilSeverity(Math.max(...p.reserves.map((r) => r.utilisation), 0), t),
      ...p.oracle.map((o) => o.severity),
      p.badDebt.byAsset.length ? "critical" : "ok",
    ]);
  const levels = (report?.pools ?? []).map(overallOf);
  const nCrit = levels.filter((l) => l === "critical").length;
  const nWarn = levels.filter((l) => l === "warn").length;
  const nTotal = levels.length;

  return (
    <>
      <PageHead title="Pools" network={network} path="/pools">
        Every Blend pool in the backstop&apos;s reward zone, plus known pools. Live from Stellar RPC, cached about a minute.
      </PageHead>
      {network === "testnet" && (
        <div className="notice">Testnet: test tokens and often mock oracles. Numbers here are for testing, not real money.</div>
      )}
      {error && <ErrorNotice error={error} />}
      {report?.discoveryError && <div className="notice">{report.discoveryError} Showing known pools only.</div>}

      {report && nTotal > 0 && (
        <div className={`verdict ${nCrit ? "bad" : nWarn ? "mid" : "good"}`}>
          <strong>
            {nCrit
              ? `${nCrit} of ${nTotal} pools need attention right now.`
              : nWarn
                ? `${nWarn} of ${nTotal} pools show a warning.`
                : `All ${nTotal} watched pools look healthy right now.`}
          </strong>
          <span className="muted small">
            {nCrit || nWarn
              ? " Open a pool below to see what triggered it."
              : " No big oracle price gaps, no bad debt and no pool close to running out of cash."}
          </span>
        </div>
      )}

      {report && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Pool</th>
                <th title="Whether the pool is open for borrowing and depositing">Status</th>
                <th className="num" title="Total money lenders have put into the pool">Supplied</th>
                <th className="num" title="Total money currently borrowed from the pool">Borrowed</th>
                <th className="num" title="Borrowed divided by supplied. Very high means lenders may struggle to withdraw">Utilisation</th>
                <th className="num" title="How far the price the pool uses is from independent market prices">Largest oracle gap</th>
                <th className="num" title="Loans that could not be recovered and were moved onto the pool backstop">Bad debt</th>
                <th>Overall</th>
              </tr>
            </thead>
            <tbody>
              {report.pools.map((p) => {
                const overall = worstSeverity([
                  utilSeverity(Math.max(...p.reserves.map((r) => r.utilisation), 0), t),
                  ...p.oracle.map((o) => o.severity),
                  p.badDebt.byAsset.length ? "critical" : "ok",
                ]);
                return (
                  <tr key={p.poolId}>
                    <td>
                      <Link href={`/pools/${p.poolId}?network=${network}`}><strong>{p.name}</strong></Link>
                      <div className="mono small muted">{shortId(p.poolId)}</div>
                    </td>
                    <td className="small">{p.statusLabel.split(" · ")[0]}<div className="muted">{statusPlain(p.status)}</div></td>
                    <td className="num"><Val v={usd(p.totals.suppliedUsd)} /></td>
                    <td className="num"><Val v={usd(p.totals.borrowedUsd)} /></td>
                    <td className="num"><Val v={pct(p.totals.utilisation, 1, true)} /></td>
                    <td className="num">
                      <Val v={signedPct(p.maxAbsGapPct)} />{" "}
                      {p.maxAbsGapPct != null && <Pill s={gapSeverity(p.maxAbsGapPct, false, t)} />}
                    </td>
                    <td className="num">
                      {p.badDebt.byAsset.length === 0 && p.badDebt.totalUsd != null ? "none" : <Val v={usd(p.badDebt.totalUsd)} />}
                    </td>
                    <td><Pill s={overall} /></td>
                  </tr>
                );
              })}
              {report.pools.length === 0 && (
                <tr><td colSpan={8} className="na">No pools could be read.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {report && report.failedPools.length > 0 && (
        <>
          <h3>Pools that could not be read</h3>
          <ul className="clean small">
            {report.failedPools.map((f) => (
              <li key={f.poolId}><span className="mono">{shortId(f.poolId)}</span> — <span className="muted">{f.error}</span></li>
            ))}
          </ul>
        </>
      )}
      <h2>How to read this page</h2>
      <div className="grid">
        <div className="card"><div className="title">Is the price right?</div><p className="muted small" style={{ marginBottom: 0 }}><strong>Largest oracle gap</strong> compares the price the pool uses with independent market prices. A big gap is the warning sign seen in the February 2026 YieldBlox exploit.</p></div>
        <div className="card"><div className="title">Is there lost money?</div><p className="muted small" style={{ marginBottom: 0 }}><strong>Bad debt</strong> is debt nobody repaid. &quot;None&quot; is what you want to see.</p></div>
        <div className="card"><div className="title">Can lenders get out?</div><p className="muted small" style={{ marginBottom: 0 }}><strong>Utilisation</strong> is the share of deposits that is borrowed. Near 100% means little cash is left to withdraw.</p></div>
      </div>

      <h2>Why only these pools?</h2>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          {SITE.name} watches the pools in Blend&apos;s backstop reward zone, plus a short list of known pools. Pools outside
          both are not found automatically. The site owner can add any pool by its contract address (it starts with
          the letter C) in the <code>EXTRA_POOLS_MAINNET</code> setting.
        </p>
        <p className="muted small" style={{ marginBottom: 0 }}>Missing a pool you care about? Open an issue on the source code page and we will add it.</p>
      </div>

      <p className="muted small">
        &quot;Overall&quot; is the worst of: highest reserve utilisation, oracle gaps, and bad debt. Thresholds are on the{" "}
        <Link href="/alerts">alerts page</Link>.
      </p>
    </>
  );
}
