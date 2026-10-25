import type { RawPool } from "@/lib/types";

/** Mock data only. Addresses are made-up placeholders in valid Stellar format. */
export const XLM = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";
export const USDC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
export const THIN = "CBLV4ATSIWU67CFSQU2NVRKINQIKUZ2ODSZBUJTJ43VJVRSBTZYOPNUR";
export const POOL_A = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
export const POOL_B = "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

export const NOW = new Date("2026-10-24T12:00:00Z");
export const NOW_SEC = Math.floor(NOW.getTime() / 1000);

export function mockPool(over: Partial<RawPool> = {}): RawPool {
  return {
    poolId: POOL_A,
    name: "Mock Pool",
    status: 1,
    oracleId: "CORACLEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    backstopId: "CBACKSTOPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    latestLedger: 100,
    reserves: [
      { assetId: XLM, index: 0, decimals: 7, code: "XLM", cFactor: 0.75, lFactor: 0.75, maxUtil: 0.95, supplied: 1_000_000, borrowed: 500_000, utilisation: 0.5, supplyApr: 0.02, borrowApr: 0.05 },
      { assetId: USDC, index: 1, decimals: 7, code: "USDC", cFactor: 0.95, lFactor: 0.95, maxUtil: 0.95, supplied: 200_000, borrowed: 190_000, utilisation: 0.95, supplyApr: 0.08, borrowApr: 0.1 },
    ],
    oraclePrices: {
      [XLM]: { price: 0.3, timestamp: NOW_SEC - 120 },
      [USDC]: { price: 1.0, timestamp: NOW_SEC - 120 },
    },
    backstopLiabilities: {},
    backstop: { totalSpotValueUsd: 500_000, q4wPct: 5 },
    ...over,
  };
}
