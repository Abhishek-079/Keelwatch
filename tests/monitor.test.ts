import { describe, expect, it, vi } from "vitest";
import { thresholds } from "@/lib/config";
import { buildNetworkReport, type MonitorDeps } from "@/lib/monitor";
import { mockPool, NOW, NOW_SEC, POOL_A, POOL_B, THIN } from "./fixtures";

function deps(over: Partial<MonitorDeps> = {}): MonitorDeps {
  return {
    discoverPools: async () => ({ ids: [POOL_A, POOL_B], error: null }),
    loadPool: async (_n, id) => {
      if (id === POOL_B) throw new Error("RPC timeout");
      return mockPool();
    },
    referencePrices: async () => ({
      XLM: [{ source: "reflector-cex", price: 0.3 }, { source: "coingecko", price: 0.301 }],
      USDC: [{ source: "coingecko", price: 1.0 }],
    }),
    now: () => NOW,
    ...over,
  };
}

describe("buildNetworkReport (mocked data sources)", () => {
  it("reports loaded pools and lists failures instead of hiding them", async () => {
    const { report } = await buildNetworkReport("mainnet", deps(), thresholds());
    expect(report.pools).toHaveLength(1);
    expect(report.failedPools).toEqual([{ poolId: POOL_B, error: "RPC timeout" }]);
    expect(report.pools[0].oracle.every((o) => o.severity === "ok")).toBe(true);
    expect(report.pools[0].stress).toBeNull();
  });

  it("catches a YieldBlox-style price spike when a reference exists", async () => {
    const d = deps({
      loadPool: async () =>
        mockPool({ oraclePrices: { ...mockPool().oraclePrices, [mockPool().reserves[0].assetId]: { price: 30, timestamp: NOW_SEC } } }),
    });
    const { report } = await buildNetworkReport("mainnet", d, thresholds());
    const xlm = report.pools[0].oracle.find((o) => o.code === "XLM")!;
    expect(xlm.severity).toBe("critical");
    expect(Math.abs(xlm.gapPct!)).toBeGreaterThan(1000);
  });

  it("shows unavailable (not ok) for an asset without an independent price", async () => {
    const raw = mockPool();
    raw.reserves.push({ ...raw.reserves[0], assetId: THIN, code: "USTRY" });
    raw.oraclePrices[THIN] = { price: 1.06, timestamp: NOW_SEC };
    const { report } = await buildNetworkReport("mainnet", deps({ loadPool: async () => raw, discoverPools: async () => ({ ids: [POOL_A], error: null }) }));
    expect(report.pools[0].oracle.find((o) => o.code === "USTRY")?.severity).toBe("unavailable");
  });

  it("survives reference-price failure", async () => {
    const { report } = await buildNetworkReport("mainnet", deps({ referencePrices: vi.fn().mockRejectedValue(new Error("down")) }));
    expect(report.pools[0].oracle.every((o) => o.severity === "unavailable")).toBe(true);
    expect(report.pools[0].totals.suppliedUsd).not.toBeNull(); // oracle prices still work
  });

  it("adds a testnet warning", async () => {
    const { report } = await buildNetworkReport("testnet", deps());
    expect(report.pools[0].warnings.join(" ")).toMatch(/mock oracles/);
  });

  it("passes discovery errors through", async () => {
    const { report } = await buildNetworkReport("mainnet", deps({ discoverPools: async () => ({ ids: [], error: "backstop unreadable" }) }));
    expect(report.discoveryError).toBe("backstop unreadable");
    expect(report.pools).toHaveLength(0);
  });
});
