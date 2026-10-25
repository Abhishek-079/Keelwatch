import { LIMITS } from "@/lib/config";

export const metadata = { title: "API" };

const endpoints: { path: string; desc: string; params: string }[] = [
  { path: "/api/v1/pools", desc: "All watched pools with totals, oracle checks, bad debt, backstop and stress.", params: "network" },
  { path: "/api/v1/pools/{poolId}", desc: "One pool in full detail.", params: "network" },
  { path: "/api/v1/oracle", desc: "Flat list of every oracle check (pool oracle vs references) across pools.", params: "network" },
  { path: "/api/v1/stress", desc: "Latest stress bands per pool (totals only).", params: "network" },
  { path: "/api/v1/history", desc: "Stored snapshots for one pool.", params: "network, pool (required), days (1–90, default 30)" },
  { path: "/api/v1/alerts", desc: "Recent alerts sent.", params: "network, limit (1–200, default 50)" },
  { path: "/api/v1/status", desc: "What this deployment has configured (database, alert channels, RPC hosts).", params: "none" },
];

export default function ApiDocs() {
  return (
    <>
      <h1>Public API</h1>
      <p className="muted">Free, read-only JSON. No key needed. CORS is open so you can call it from a browser.</p>
      <ul className="clean">
        <li><strong>Network:</strong> add <code>?network=mainnet</code> (default) or <code>?network=testnet</code>. Every response includes <code>network</code>.</li>
        <li><strong>Unavailable values</strong> are <code>null</code>. Never treat <code>null</code> as zero.</li>
        <li><strong>Rate limit:</strong> about {LIMITS.rateLimitPerMin} requests per minute per IP. Over the limit you get HTTP 429 with a <code>retry-after</code> header. Responses are cached for 60 seconds.</li>
        <li><strong>Errors:</strong> HTTP 503 with <code>{`{"error":"upstream_unavailable"}`}</code> when Stellar RPC or the database can&apos;t be reached.</li>
      </ul>

      <h2>Endpoints</h2>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Path</th><th>Returns</th><th>Query</th></tr></thead>
          <tbody>
            {endpoints.map((e) => (
              <tr key={e.path}><td className="mono small"><a href={e.path.includes("{") ? undefined : e.path}>{e.path}</a></td><td style={{ whiteSpace: "normal" }}>{e.desc}</td><td className="small">{e.params}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Example</h2>
      <pre>{`curl "https://YOUR-DEPLOYMENT/api/v1/oracle?network=mainnet"`}</pre>
      <div className="example">
        <pre style={{ margin: 0 }}>{`{
  "network": "mainnet",
  "fetchedAt": "2026-10-24T12:00:00.000Z",
  "checks": [
    {
      "poolId": "C…",
      "poolName": "Example Pool",
      "assetId": "C…",
      "code": "XLM",
      "oraclePrice": 0.31,
      "oracleAgeSec": 140,
      "references": [
        { "source": "reflector-cex", "price": 0.309 },
        { "source": "coingecko", "price": null, "error": "HTTP 429" }
      ],
      "gapPct": 0.32,
      "stale": false,
      "severity": "ok"
    }
  ]
}`}</pre>
      </div>

      <h2>Fields</h2>
      <ul className="clean small">
        <li><code>utilisation</code>, <code>supplyApr</code>, <code>borrowApr</code>, <code>cFactor</code>: ratios from 0 to 1.</li>
        <li><code>gapPct</code>, <code>maxAbsGapPct</code>, <code>q4wPct</code>: percentages (5 means 5%).</li>
        <li><code>supplied</code>, <code>borrowed</code>: token units. <code>*Usd</code>: valued at the pool&apos;s oracle price.</li>
        <li><code>severity</code>: <code>ok</code>, <code>warn</code>, <code>critical</code> or <code>unavailable</code>.</li>
      </ul>
    </>
  );
}
