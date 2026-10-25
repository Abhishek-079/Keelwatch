import Link from "next/link";
import { parseNetwork, thresholds } from "@/lib/config";
import { getSql, recentAlerts } from "@/lib/db";
import { channelsConfigured } from "@/lib/alerts/dispatch";
import { shortId } from "@/lib/format";
import { ErrorNotice, PageHead, Pill } from "../components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alerts" };

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ network?: string }> }) {
  const network = parseNetwork((await searchParams).network);
  const t = thresholds();
  const ch = channelsConfigured();
  const tg = process.env.PUBLIC_TELEGRAM_URL;
  const dc = process.env.PUBLIC_DISCORD_URL;
  const alertNets = (process.env.ALERT_NETWORKS || "mainnet").split(",").map((s) => s.trim());

  const sql = getSql();
  let log: Awaited<ReturnType<typeof recentAlerts>> = [];
  let error: string | null = null;
  if (sql) {
    try {
      log = await recentAlerts(sql, network, 50);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  const rules: [string, string][] = [
    ["Utilisation", `A reserve is ≥ ${(t.utilWarn * 100).toFixed(0)}% borrowed (critical at ${(t.utilCrit * 100).toFixed(0)}%). Lenders may struggle to withdraw.`],
    ["Oracle gap", `Pool oracle differs from an independent reference by ≥ ${t.gapWarnPct}% (critical at ${t.gapCritPct}%). Mainnet only.`],
    ["Stale oracle", `Oracle price older than ${Math.round(t.oracleStaleSec / 60)} minutes.`],
    ["Bad debt", `The backstop holds ≥ $${t.badDebtUsdWarn} of debt, or debt whose value can't be read.`],
    ["Stress", `Tracked positions below health factor 1.10 hold ≥ $${t.stressLiabUsdWarn.toLocaleString("en-US")} of debt.`],
    ["Backstop withdrawals", `≥ ${t.q4wWarnPct}% of the backstop is queued to withdraw.`],
    ["Pool status", "The pool moves to On ice or Frozen."],
  ];

  return (
    <>
      <PageHead title="Alerts" network={network} path="/alerts">
        Telegram and Discord messages when a pool crosses a threshold. Checked on every scheduled snapshot.
      </PageHead>

      <h2>Join</h2>
      <div className="row">
        {tg ? <a className="btn" href={tg}>Telegram channel</a> : <span className="btn ghost">Telegram: not set up yet</span>}
        {dc ? <a className="btn" href={dc}>Discord server</a> : <span className="btn ghost">Discord: not set up yet</span>}
      </div>
      <p className="small muted">
        Sending status on this deployment: Telegram {ch.telegram ? "connected" : "not configured"}, Discord{" "}
        {ch.discord ? "connected" : "not configured"}. Networks with alerts: {alertNets.join(", ")}. Running your own copy?
        See the README for setup.
      </p>

      <h2>Rules</h2>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Rule</th><th>Fires when</th></tr></thead>
          <tbody>{rules.map(([r, d]) => <tr key={r}><td><strong>{r}</strong></td><td style={{ whiteSpace: "normal" }}>{d}</td></tr>)}</tbody>
        </table>
      </div>

      <h3>How we avoid spam</h3>
      <ul className="clean">
        <li>Each condition sends <strong>once</strong> when it starts.</li>
        <li>It repeats only if it gets worse (warning → critical) or as a reminder every {t.alertRemindHours} hours while it lasts.</li>
        <li>If it clears and comes back within {t.alertCooldownMin} minutes, no new message is sent.</li>
        <li>One &quot;resolved&quot; message when it clears. At most {t.alertMaxPerRun} messages per run, most severe first.</li>
      </ul>

      <h2>Recent alerts</h2>
      {!sql && <p className="na">unavailable — the alert log needs the database.</p>}
      {error && <ErrorNotice error={error} />}
      {sql && !error && log.length === 0 && <p className="muted">No alerts recorded for {network} yet.</p>}
      {log.length > 0 && (
        <div className="tablewrap">
          <table>
            <thead><tr><th>Time (UTC)</th><th>Severity</th><th>Pool</th><th>Message</th></tr></thead>
            <tbody>
              {log.map((a, i) => (
                <tr key={i}>
                  <td className="small mono">{a.sentAt.slice(0, 16).replace("T", " ")}</td>
                  <td><Pill s={a.severity as "warn"}>{a.severity}</Pill></td>
                  <td><Link className="mono small" href={`/pools/${a.poolId}?network=${a.network}`}>{shortId(a.poolId)}</Link></td>
                  <td style={{ whiteSpace: "normal" }} className="small">{a.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
