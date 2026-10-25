import { describe, expect, it, vi } from "vitest";
import { coingeckoPrices } from "@/lib/sources/reference";
import { rateLimit } from "@/lib/api";
import { saveSnapshot, type Sql } from "@/lib/db";
import { buildPoolReport } from "@/lib/monitor";
import { thresholds } from "@/lib/config";
import { mockPool, NOW } from "./fixtures";

describe("CoinGecko reference (mocked HTTP)", () => {
  it("maps known codes and marks unknown ones unavailable", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ stellar: { usd: 0.31 } }), { status: 200 }));
    const out = await coingeckoPrices(["XLM", "USTRY"], f);
    expect(out.XLM.price).toBe(0.31);
    expect(out.USTRY.price).toBeNull();
    expect(f.mock.calls[0][0]).toContain("ids=stellar");
  });
  it("returns unavailable on HTTP error instead of throwing", async () => {
    const f = vi.fn().mockResolvedValue(new Response("busy", { status: 429 }));
    const out = await coingeckoPrices(["XLM"], f);
    expect(out.XLM).toMatchObject({ price: null, error: "HTTP 429" });
  });
  it("treats a zero or missing price as unavailable", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ stellar: { usd: 0 } }), { status: 200 }));
    expect((await coingeckoPrices(["XLM"], f)).XLM.price).toBeNull();
  });
});

describe("public API rate limit", () => {
  it("blocks after the limit and resets after the window", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000, 1000).ok).toBe(true);
    expect(rateLimit(key, 3, 60_000, 1000).ok).toBe(false);
    expect(rateLimit(key, 3, 60_000, 62_000).ok).toBe(true);
  });
});

describe("snapshot storage (mocked database)", () => {
  it("writes aggregate numbers and nulls for unavailable values", async () => {
    const calls: unknown[][] = [];
    const sql = Object.assign(
      async (_s: TemplateStringsArray, ...v: unknown[]) => {
        calls.push(v);
        return [];
      },
      { query: async () => [] },
    ) as unknown as Sql;
    const raw = mockPool({ backstopLiabilities: null });
    await saveSnapshot(sql, buildPoolReport("mainnet", raw, {}, thresholds(), NOW));
    const v = calls[0];
    expect(v[0]).toBe("mainnet");
    expect(v[3]).toBeCloseTo(500_000); // supplied_usd
    expect(v[6]).toBeNull(); // bad_debt_usd unavailable
    expect(v[10]).toBeNull(); // stress not computed
  });
});
