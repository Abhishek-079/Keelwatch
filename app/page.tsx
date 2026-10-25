import Link from "next/link";
import { SITE } from "@/lib/site";
import { safeNetworkReport } from "@/lib/data";
import { signedPct, usd } from "@/lib/format";
import { gapSeverity } from "@/lib/risk";
import { thresholds } from "@/lib/config";
import { ErrorNotice, NetworkBadge, Pill, Stat } from "./components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { report, error } = await safeNetworkReport("mainnet");
  const pools = report?.pools ?? [];
  const live = !!report && pools.length > 0;
  const allPriced = pools.length > 0 && pools.every((p) => p.totals.suppliedUsd != null);
  const supplied = allPriced ? pools.reduce((a, p) => a + (p.totals.suppliedUsd as number), 0) : null;
  const gaps = pools.map((p) => p.maxAbsGapPct).filter((g): g is number => g != null);
  const worstGap = gaps.length ? gaps.reduce((a, g) => (Math.abs(g) > Math.abs(a) ? g : a)) : null;
  const badDebtPools = pools.filter((p) => p.badDebt.byAsset.length > 0).length;
  const badDebtKnown = pools.length > 0 && pools.every((p) => p.badDebt.totalUsd != null || p.badDebt.byAsset.length > 0);

  return (
    <>
      <section className="hero">
        <div>
          <h1>Watch Blend lending pools before they break.</h1>
          <p className="lead">
            {SITE.name} is a free public monitor for Blend pools on Stellar. It compares each pool&apos;s oracle price
            with independent prices, tracks bad debt and borrowers near liquidation, keeps history, and sends Telegram
            and Discord alerts. It only watches and warns; it never liquidates or moves funds.
          </p>
          <div className="row">
            <Link className="btn" href="/pools">See live pools</Link>
            <Link className="btn ghost" href="/alerts">Get alerts</Link>
            <Link className="btn ghost" href="/api-docs">Use the API</Link>
          </div>
        </div>
        <div className="panel" aria-label="Live oracle check">
          <div className="ph"><span>Oracle check</span><NetworkBadge network="mainnet" /></div>
          {live ? (
            pools.slice(0, 4).map((p) => (
              <Link key={p.poolId} href={`/pools/${p.poolId}?network=mainnet`} style={{ color: "inherit", textDecoration: "none" }}>
                <div className="item">
                  <div><div className="n">{p.name}</div><div className="s">Largest oracle gap</div></div>
                  <div className="v">
                    <span>{signedPct(p.maxAbsGapPct)}</span>
                    {p.maxAbsGapPct != null && <Pill s={gapSeverity(p.maxAbsGapPct, false, thresholds())} />}
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="empty">Live pool data is unavailable right now, so nothing is shown instead of guessing.</div>
          )}
          <div className="foot">Pool oracle vs independent reference prices. Live from Stellar.</div>
        </div>
      </section>

      <h2 className="row">Right now <NetworkBadge network="mainnet" /></h2>
      {error && <ErrorNotice error={error} />}
      <div className="grid">
        <Stat label="Pools watched" value={live ? String(pools.length) : "unavailable"} hint={report?.failedPools.length ? `${report.failedPools.length} could not be read` : "live from Stellar RPC"} />
        <Stat label="Total supplied" value={usd(supplied)} hint="valued at each pool's own oracle price" />
        <Stat label="Largest oracle gap" value={signedPct(worstGap)} hint="pool oracle vs independent reference" />
        <Stat label="Pools with bad debt" value={live && badDebtKnown ? String(badDebtPools) : "unavailable"} hint="debt held by the pool's backstop" />
      </div>
      {live && report && <p className="muted small">Fetched {new Date(report.fetchedAt).toUTCString()}. Values refresh about every minute.</p>}

      <h2>Why this exists</h2>
      <div className="split">
        <div className="card">
          <p style={{ marginTop: 0 }}>
            On 22 February 2026 the community-managed YieldBlox DAO pool on Blend V2 was drained. The attacker pushed
            the Stellar DEX price of USTRY, a thinly traded tokenized-Treasury token, roughly 100× higher. The
            pool&apos;s Reflector-based oracle passed that price through, and the attacker borrowed about 61.25M XLM
            and 1M USDC against it. Published loss estimates range from about $10.2M to $10.9M.
          </p>
          <p>
            Security reviews describe it as a pool-configuration and oracle-design problem, not a bug in Blend&apos;s
            core contracts. The warning sign, an oracle price far from the real market, is exactly the kind of thing a
            public monitor can surface.
          </p>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Sources:{" "}
            <a href="https://www.halborn.com/blog/post/explained-the-yieldblox-hack-february-2026">Halborn</a>,{" "}
            <a href="https://blocksec.com/blog/yieldblox-dao-incident-on-stellar-oracle-misconfiguration-enabled-a-10m-drain">BlockSec</a>,{" "}
            <a href="https://www.quillaudits.com/blog/hack-analysis/yeildblox-10m-hack-explained">QuillAudits</a>.
          </p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>What {SITE.name} watches</h3>
          <ul className="clean">
            <li><strong>Pools:</strong> supplied, borrowed, utilisation and rates per asset.</li>
            <li><strong>Oracle gaps:</strong> each pool oracle vs Reflector&apos;s exchange feed and CoinGecko.</li>
            <li><strong>Bad debt:</strong> debt the pool has moved onto its backstop.</li>
            <li><strong>Stress:</strong> how much debt sits near liquidation, as totals only.</li>
            <li><strong>Backstop:</strong> its value and how much is queued for withdrawal.</li>
          </ul>
          <div className="example small">
            🔴 [mainnet] Example Pool: ABC oracle price 106.7 differs from reference (coingecko) by +9,960%.
          </div>
        </div>
      </div>

      <h2>Honest limits</h2>
      <ul className="clean">
        <li>Assets without an independent price (many thin tokens) show &quot;unavailable&quot; for the gap check.</li>
        <li>The stress view only sees borrowers active since the monitor started indexing. Coverage is shown on each pool page.</li>
        <li>An alert is a signal, not proof of an attack. Always check before acting.</li>
        <li>USD values use each pool&apos;s own oracle price, so a manipulated oracle also distorts USD totals. That is why the gap check matters.</li>
      </ul>
    </>
  );
}
