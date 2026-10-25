import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/snapshot", () => ({ runSnapshot: vi.fn().mockResolvedValue({ database: false }) }));
vi.mock("@/lib/data", () => ({
  getNetworkReport: vi.fn().mockResolvedValue({
    network: "mainnet",
    fetchedAt: "2026-10-24T12:00:00.000Z",
    pools: [],
    failedPools: [{ poolId: "CX", error: "fetch failed" }],
    discoveryError: null,
  }),
}));

describe("cron route (mocked job)", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("refuses requests without the secret", async () => {
    vi.stubEnv("CRON_SECRET", "a-very-long-test-secret");
    const { GET } = await import("@/app/api/cron/snapshot/route");
    expect((await GET(new Request("http://x/api/cron/snapshot"))).status).toBe(401);
    expect((await GET(new Request("http://x", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  });
  it("runs with the right secret", async () => {
    vi.stubEnv("CRON_SECRET", "a-very-long-test-secret");
    const { GET } = await import("@/app/api/cron/snapshot/route");
    const res = await GET(new Request("http://x", { headers: { authorization: "Bearer a-very-long-test-secret" } }));
    expect(res.status).toBe(200);
  });
  it("refuses to run when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { GET } = await import("@/app/api/cron/snapshot/route");
    expect((await GET(new Request("http://x"))).status).toBe(500);
  });
});

describe("public pools route (mocked data)", () => {
  it("returns 503 instead of an empty success when no pool could be read", async () => {
    const { GET } = await import("@/app/api/v1/pools/route");
    const res = await GET(new Request("http://x/api/v1/pools?network=mainnet", { headers: { "x-forwarded-for": "1.2.3.4" } }), {} as never);
    expect(res.status).toBe(503);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
