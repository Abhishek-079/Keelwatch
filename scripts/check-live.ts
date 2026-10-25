// Run with: npm run check:live
// Tests every live data source once and prints exactly what works. Sends nothing unless you add --send-test.
import "./env";
import { rpc } from "@stellar/stellar-sdk";
import { NETWORK_CONFIG, type NetworkName } from "../lib/config";
import { discoverAccounts, discoverPools, loadRawPool } from "../lib/sources/blend";
import { coingeckoPrices, reflectorCexPrices } from "../lib/sources/reference";
import { getSql } from "../lib/db";
import { channelsConfigured, sendDiscord, sendTelegram } from "../lib/alerts/dispatch";

const results: { name: string; ok: boolean; detail: string }[] = [];
async function check(name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`✅ ${name}: ${detail}`);
  } catch (e) {
    const detail = (e as Error).message;
    results.push({ name, ok: false, detail });
    console.log(`❌ ${name}: ${detail}`);
  }
}

async function main() {
  for (const net of ["mainnet", "testnet"] as NetworkName[]) {
    const c = NETWORK_CONFIG[net];
    await check(`${net} RPC (${new URL(c.rpcUrl).host})`, async () => {
      const l = await new rpc.Server(c.rpcUrl).getLatestLedger();
      return `latest ledger ${l.sequence}`;
    });
    let firstPool = c.knownPools[0].id;
    await check(`${net} pool discovery`, async () => {
      const d = await discoverPools(net);
      if (d.error) throw new Error(d.error);
      firstPool = d.ids[0] ?? firstPool;
      return `${d.ids.length} pools: ${d.ids.map((i) => i.slice(0, 6)).join(", ")}`;
    });
    await check(`${net} read pool ${firstPool.slice(0, 6)}…`, async () => {
      const { raw } = await loadRawPool(net, firstPool);
      const priced = Object.values(raw.oraclePrices).filter(Boolean).length;
      return `"${raw.name}", ${raw.reserves.length} reserves (${raw.reserves.map((r) => r.code ?? "?").join(", ")}), ${priced}/${raw.reserves.length} oracle prices, bad debt ${raw.backstopLiabilities ? "readable" : "NOT readable"}, backstop ${raw.backstop ? "readable" : "NOT readable"}`;
    });
    await check(`${net} pool events (for stress view)`, async () => {
      const r = await discoverAccounts(net, firstPool, null, 2);
      return `${r.accounts.length} accounts found in recent events; RPC keeps events from ledger ${r.oldestLedger}`;
    });
    await check(`${net} Reflector exchanges feed`, async () => {
      const p = await reflectorCexPrices(net, ["XLM", "USDC"]);
      if (Object.values(p).every((v) => v.price == null)) throw new Error(Object.values(p)[0]?.error ?? "no prices");
      return Object.entries(p).map(([k, v]) => `${k}=${v.price ?? `unavailable (${v.error})`}`).join(", ");
    });
  }
  await check("CoinGecko", async () => {
    const p = await coingeckoPrices(["XLM", "USDC"]);
    if (Object.values(p).every((v) => v.price == null)) throw new Error(Object.values(p)[0]?.error ?? "no prices");
    return Object.entries(p).map(([k, v]) => `${k}=${v.price ?? "unavailable"}`).join(", ");
  });
  await check("Database", async () => {
    const sql = getSql();
    if (!sql) throw new Error("DATABASE_URL not set (history, stress view and alerts need it)");
    await sql`SELECT 1`;
    return "connected";
  });
  const ch = channelsConfigured();
  console.log(`ℹ️  Telegram ${ch.telegram ? "configured" : "not configured"}, Discord ${ch.discord ? "configured" : "not configured"}`);
  if (process.argv.includes("--send-test")) {
    const text = "✅ Keelwatch test message. Alerts are working.";
    await check("Telegram test message", async () => ((await sendTelegram(text)) ? "sent" : "not sent"));
    await check("Discord test message", async () => ((await sendDiscord(text)) ? "sent" : "not sent"));
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} of ${results.length} checks passed.`);
}
main();
