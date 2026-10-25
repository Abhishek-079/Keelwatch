import Link from "next/link";
import { parseNetwork } from "@/lib/config";
import { safeNetworkReport } from "@/lib/data";
import { pct, shortId, signedPct, usd } from "@/lib/format";
import { gapSeverity, utilSeverity, worstSeverity } from "@/lib/risk";
import { thresholds } from "@/lib/config";
import { ErrorNotice, PageHead, Pill, Val } from "../components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pools" };

export default async function PoolsPage({ searchParams }: { searchParams: Promise<{ network?: string }> }) {
  const network = parseNetwork((await searchParams).network);
  const { report, error } = await safeNetworkReport(network);
  const t = thresholds();

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

      {report && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Pool</th>
                <th>Status</th>
                <th className="num">Supplied</th>
                <th className="num">Borrowed</th>
                <th className="num">Utilisation</th>
                <th className="num">Largest oracle gap</th>
                <th className="num">Bad debt</th>
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
                    <td className="small">{p.statusLabel}</td>
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
      <p className="muted small">
        &quot;Overall&quot; is the worst of: highest reserve utilisation, oracle gaps, and bad debt. Thresholds are on the{" "}
        <Link href="/alerts">alerts page</Link>.
      </p>
    </>
  );
}
