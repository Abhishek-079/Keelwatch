import Link from "next/link";
import { NETWORK_CONFIG } from "@/lib/config";
import { SITE } from "@/lib/site";
import { STRESS_BANDS } from "@/lib/risk";

export const metadata = { title: "Docs" };

export default function DocsPage() {
  return (
    <>
      <h1>How {SITE.name} works</h1>
      <p className="muted">Every number on this site comes from public on-chain data or a named price source. If something can&apos;t be read, it says &quot;unavailable&quot;. Nothing is estimated or filled in.</p>

      <h2>Data sources</h2>
      <ul className="clean">
        <li><strong>Blend pools</strong> are read through Stellar RPC using the official <a href="https://github.com/blend-capital/blend-sdk-js">Blend JS SDK</a>.</li>
        <li><strong>Which pools:</strong> every pool in the Blend backstop&apos;s reward zone, plus pools listed in <a href="https://github.com/blend-capital/blend-utils">blend-utils</a>, plus any extra pools set by the operator.</li>
        <li><strong>Pool oracle prices</strong> come from each pool&apos;s own oracle contract (SEP-40 <code>lastprice</code>), the same price the pool uses.</li>
        <li><strong>Reference prices</strong> come from Reflector&apos;s external exchanges feed (a different feed from the Stellar DEX feed) and from the CoinGecko public API.</li>
      </ul>

      <h2>Metrics</h2>
      <h3>Supplied, borrowed, utilisation</h3>
      <p>Per asset, from the reserve&apos;s on-chain totals (b-tokens and d-tokens converted with their current rates). USD values multiply by the pool&apos;s own oracle price. Pool utilisation = total borrowed USD ÷ total supplied USD. If any asset has no oracle price, pool USD totals are shown as unavailable.</p>
      <h3>Oracle gap</h3>
      <p>Gap = (pool oracle price − reference price) ÷ reference price. When both references exist, the larger gap is shown. Assets with no reference (for example many thin tokens) are &quot;unavailable&quot;, never &quot;ok&quot;. A price older than the stale limit is flagged too. On testnet, pools often use mock oracles, so gaps there mean nothing.</p>
      <h3>Bad debt</h3>
      <p>When a borrower has debt but no collateral left, Blend moves that debt onto the backstop&apos;s own position in the pool (<a href="https://docs.blend.capital/tech-docs/core-contracts/lending-pool/bad-debt-management">Blend docs</a>). {SITE.name} reads that position. Any debt there is bad debt.</p>
      <h3>Backstop</h3>
      <p>The pool&apos;s backstop deposit value (from the backstop LP token) and the share of it queued for withdrawal. A rising queue can mean insurers are leaving.</p>
      <h3>Stress view</h3>
      <p>Health factor (HF) = effective collateral ÷ effective debt, using Blend&apos;s collateral and liability factors. Positions are grouped into bands:</p>
      <ul className="clean">{STRESS_BANDS.map((b) => <li key={b.label}>{b.label}</li>)}</ul>
      <p><strong>Coverage limit:</strong> Blend has no &quot;list all borrowers&quot; function. The scheduled job reads recent pool events (borrow, supply collateral, auctions) to find accounts, and Stellar RPC providers keep only recent events (often about 7 days). So the stress view starts partial and fills in over time. Each pool page states its coverage.</p>

      <h2>Privacy</h2>
      <ul className="clean">
        <li>Account addresses are used only to read positions. They are kept in a private table so the job can re-check them, and are never shown on the site or returned by the API.</li>
        <li>Only totals (counts and USD amounts per band) are published.</li>
        <li>No cookies, no sign-up, no tracking of visitors.</li>
      </ul>

      <h2>Schedule</h2>
      <p>A scheduled job (every 15 minutes via GitHub Actions, or daily via Vercel Cron) reads every pool, computes the stress view, saves a snapshot, and sends alerts. Live pages are cached for about a minute.</p>

      <h2>Contracts used</h2>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Network</th><th>Backstop</th><th>Reflector exchanges feed</th></tr></thead>
          <tbody>
            {(["mainnet", "testnet"] as const).map((n) => (
              <tr key={n}><td>{n}</td><td className="mono small">{NETWORK_CONFIG[n].backstopId}</td><td className="mono small">{NETWORK_CONFIG[n].reflectorCexFeed}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>What {SITE.name} does not do</h2>
      <ul className="clean">
        <li>It does not liquidate, trade, or hold anyone&apos;s funds. It has no keys that can move money.</li>
        <li>It does not tell you whether to deposit or withdraw. Alerts are signals to investigate.</li>
      </ul>
      <p>Building on this data? See the <Link href="/api-docs">API docs</Link>.</p>
    </>
  );
}
