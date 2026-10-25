import { afterEach, describe, expect, it, vi } from "vitest";
import { thresholds } from "@/lib/config";
import { buildPoolReport } from "@/lib/monitor";
import { evaluatePool } from "@/lib/alerts/rules";
import { decideAlerts, sendDiscord, sendTelegram, type AlertState } from "@/lib/alerts/dispatch";
import { mockPool, NOW, NOW_SEC, POOL_A, XLM } from "./fixtures";

const t = thresholds();
const refs = { XLM: [{ source: "coingecko" as const, price: 0.3 }], USDC: [{ source: "coingecko" as const, price: 1 }] };

describe("alert rules", () => {
  it("flags high utilisation and nothing else on a healthy pool", () => {
    const p = buildPoolReport("mainnet", mockPool(), refs, t, NOW);
    const c = evaluatePool(p, t);
    expect(c.map((x) => x.rule)).toEqual(["utilisation"]); // USDC at 95%
    expect(c[0].severity).toBe("warn");
  });
  it("flags oracle gap, bad debt, backstop withdrawals and frozen status", () => {
    const raw = mockPool({
      status: 5,
      oraclePrices: { ...mockPool().oraclePrices, [XLM]: { price: 0.45, timestamp: NOW_SEC } },
      backstopLiabilities: { [XLM]: 10_000 },
      backstop: { totalSpotValueUsd: 1, q4wPct: 40 },
    });
    const rules = evaluatePool(buildPoolReport("mainnet", raw, refs, t, NOW), t).map((x) => `${x.rule}:${x.severity}`);
    expect(rules).toContain("oracle_gap:critical");
    expect(rules).toContain("bad_debt:critical");
    expect(rules).toContain("backstop_q4w:warn");
    expect(rules).toContain("pool_status:critical");
  });
  it("does not raise oracle-gap alerts on testnet", () => {
    const raw = mockPool({ oraclePrices: { ...mockPool().oraclePrices, [XLM]: { price: 9, timestamp: NOW_SEC } } });
    const rules = evaluatePool(buildPoolReport("testnet", raw, refs, t, NOW), t).map((x) => x.rule);
    expect(rules).not.toContain("oracle_gap");
  });
});

describe("alert rate limiting", () => {
  const cand = (sev: "warn" | "critical", rule = "utilisation") => ({
    key: `mainnet:${POOL_A}:${rule}`, rule, network: "mainnet", poolId: POOL_A, poolName: "Mock", severity: sev, message: "m",
  });
  const prefix = [`mainnet:${POOL_A}:`];
  const st = (over: Partial<AlertState>): Map<string, AlertState> =>
    new Map([[cand("warn").key, { key: cand("warn").key, active: true, severity: "warn", lastSentAt: NOW, ...over }]]);
  const later = (min: number) => new Date(NOW.getTime() + min * 60_000);

  it("sends a new alert once", () => {
    expect(decideAlerts([cand("warn")], new Map(), prefix, NOW, t).send).toHaveLength(1);
  });
  it("does not repeat an ongoing alert before the reminder interval", () => {
    expect(decideAlerts([cand("warn")], st({}), prefix, later(30), t).send).toHaveLength(0);
    expect(decideAlerts([cand("warn")], st({}), prefix, later(5 * 60), t).send).toHaveLength(0);
    expect(decideAlerts([cand("warn")], st({}), prefix, later(6 * 60 + 1), t).send).toHaveLength(1);
  });
  it("sends immediately when severity escalates", () => {
    expect(decideAlerts([cand("critical")], st({}), prefix, later(1), t).send[0].severity).toBe("critical");
  });
  it("suppresses flapping re-activation within cooldown", () => {
    expect(decideAlerts([cand("warn")], st({ active: false }), prefix, later(10), t).send).toHaveLength(0);
  });
  it("sends one resolved message after cooldown, only for pools checked this run", () => {
    expect(decideAlerts([], st({}), prefix, later(61), t).send[0].severity).toBe("resolved");
    expect(decideAlerts([], st({}), ["mainnet:OTHER:"], later(61), t).send).toHaveLength(0);
  });
  it("caps messages per run", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ ...cand("warn"), key: `mainnet:${POOL_A}:r${i}` }));
    const d = decideAlerts(many, new Map(), prefix, NOW, t);
    expect(d.send).toHaveLength(t.alertMaxPerRun);
    expect(d.suppressed).toBe(25 - t.alertMaxPerRun);
  });
});

describe("senders (mocked HTTP)", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("posts to Telegram and Discord when configured", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:abc");
    vi.stubEnv("TELEGRAM_CHAT_ID", "-100");
    vi.stubEnv("DISCORD_WEBHOOK_URL", "https://discord.example/webhook");
    const f = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await sendTelegram("hi", f)).toBe(true);
    expect(await sendDiscord("hi", f)).toBe(true);
    expect(f.mock.calls[0][0]).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(JSON.parse(f.mock.calls[1][1].body).allowed_mentions).toEqual({ parse: [] });
  });
  it("does nothing when not configured", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("DISCORD_WEBHOOK_URL", "");
    const f = vi.fn();
    expect(await sendTelegram("hi", f)).toBe(false);
    expect(await sendDiscord("hi", f)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});
