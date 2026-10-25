import { describe, expect, it } from "vitest";
import { thresholds } from "@/lib/config";
import {
  bucketPositions,
  buildBadDebt,
  buildOracleChecks,
  buildReserves,
  gapPct,
  gapSeverity,
  healthFactor,
  largestGap,
  poolTotals,
  referenceCode,
  statusLabel,
  utilSeverity,
} from "@/lib/risk";
import { mockPool, NOW_SEC, THIN, USDC, XLM } from "./fixtures";

const t = thresholds();

describe("price gap maths", () => {
  it("computes signed percentage gap", () => {
    expect(gapPct(1.1, 1)).toBeCloseTo(10);
    expect(gapPct(0.9, 1)).toBeCloseTo(-10);
  });
  it("refuses bad reference values", () => {
    expect(gapPct(1, 0)).toBeNull();
    expect(gapPct(NaN, 1)).toBeNull();
  });
  it("picks the largest absolute gap across references and ignores missing ones", () => {
    const g = largestGap(1.0, [
      { source: "reflector-cex", price: 0.99 },
      { source: "coingecko", price: null, error: "x" },
      { source: "coingecko", price: 1.05 },
    ]);
    expect(g).toBeCloseTo(-4.7619, 3);
  });
  it("returns null when there is no reference at all (never invents one)", () => {
    expect(largestGap(1.0, [])).toBeNull();
    expect(largestGap(null, [{ source: "coingecko", price: 1 }])).toBeNull();
  });
  it("grades severity", () => {
    expect(gapSeverity(0.5, false, t)).toBe("ok");
    expect(gapSeverity(3, false, t)).toBe("warn");
    expect(gapSeverity(-50, false, t)).toBe("critical");
    expect(gapSeverity(null, false, t)).toBe("unavailable");
    expect(gapSeverity(null, true, t)).toBe("warn");
    expect(utilSeverity(0.99, t)).toBe("critical");
    expect(utilSeverity(null, t)).toBe("unavailable");
  });
});

describe("pool maths", () => {
  it("computes USD values from oracle prices", () => {
    const r = buildReserves(mockPool(), NOW_SEC);
    expect(r[0].suppliedUsd).toBeCloseTo(300_000);
    expect(r[0].oracleAgeSec).toBe(120);
    const totals = poolTotals(r);
    expect(totals.suppliedUsd).toBeCloseTo(500_000);
    expect(totals.borrowedUsd).toBeCloseTo(340_000);
    expect(totals.utilisation).toBeCloseTo(0.68);
  });
  it("shows totals as unavailable if any price is missing", () => {
    const raw = mockPool({ oraclePrices: { [XLM]: { price: 0.3, timestamp: NOW_SEC }, [USDC]: null } });
    const r = buildReserves(raw, NOW_SEC);
    expect(r[1].suppliedUsd).toBeNull();
    expect(poolTotals(r)).toEqual({ suppliedUsd: null, borrowedUsd: null, utilisation: null });
  });
  it("reads bad debt from backstop liabilities", () => {
    const raw = mockPool({ backstopLiabilities: { [XLM]: 1000 } });
    const bd = buildBadDebt(raw, buildReserves(raw, NOW_SEC));
    expect(bd.totalUsd).toBeCloseTo(300);
    expect(bd.byAsset[0].code).toBe("XLM");
  });
  it("marks bad debt unavailable when it could not be read", () => {
    const raw = mockPool({ backstopLiabilities: null });
    expect(buildBadDebt(raw, buildReserves(raw, NOW_SEC)).totalUsd).toBeNull();
  });
  it("flags an asset with no reference price as unavailable rather than ok", () => {
    const raw = mockPool();
    raw.reserves.push({ ...raw.reserves[0], assetId: THIN, code: "USTRY" });
    raw.oraclePrices[THIN] = { price: 106.73, timestamp: NOW_SEC };
    const checks = buildOracleChecks(buildReserves(raw, NOW_SEC), {}, t);
    expect(checks.find((c) => c.assetId === THIN)?.severity).toBe("unavailable");
  });
  it("flags stale oracle prices", () => {
    const raw = mockPool({ oraclePrices: { [XLM]: { price: 0.3, timestamp: NOW_SEC - 7200 }, [USDC]: { price: 1, timestamp: NOW_SEC } } });
    const checks = buildOracleChecks(buildReserves(raw, NOW_SEC), { XLM: [{ source: "coingecko", price: 0.3 }] }, t);
    expect(checks[0].stale).toBe(true);
    expect(checks[0].severity).toBe("warn");
  });
});

describe("stress buckets", () => {
  it("computes health factor and buckets without addresses", () => {
    expect(healthFactor(110, 100)).toBeCloseTo(1.1);
    expect(healthFactor(1, 0)).toBeNull();
    const b = bucketPositions([
      { hf: 0.9, liabilitiesUsd: 100 },
      { hf: 1.02, liabilitiesUsd: 50 },
      { hf: 1.03, liabilitiesUsd: 25 },
      { hf: 2, liabilitiesUsd: 999 },
    ]);
    expect(b[0].count).toBe(1);
    expect(b[1].count).toBe(2);
    expect(b[1].liabilitiesUsd).toBe(75);
    expect(b.reduce((a, x) => a + x.count, 0)).toBe(3);
    expect(JSON.stringify(b)).not.toMatch(/[GC][A-Z2-7]{55}/);
  });
});

describe("labels", () => {
  it("labels status codes and asset codes", () => {
    expect(statusLabel(3)).toContain("On ice");
    expect(statusLabel(42)).toContain("Unknown");
    expect(referenceCode("native")).toBe("XLM");
    expect(referenceCode("wBTC")).toBe("BTC");
    expect(referenceCode("USTRY")).toBeNull();
  });
});
