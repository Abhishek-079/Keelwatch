import type { NetworkName } from "./config";

/** `null` always means "could not be read". The UI shows it as "unavailable". */
export type Maybe<T> = T | null;

export type Severity = "ok" | "warn" | "critical" | "unavailable";

/** Raw, normalised data for one pool as read from the chain. */
export interface RawReserve {
  assetId: string;
  index: number;
  decimals: number;
  code: Maybe<string>;
  cFactor: number;
  lFactor: number;
  maxUtil: number;
  supplied: number; // token units
  borrowed: number; // token units
  utilisation: number; // 0..1
  supplyApr: number; // 0..1
  borrowApr: number; // 0..1
}

export interface RawPrice {
  price: number; // in the oracle's base unit (USD for Reflector-based oracles)
  timestamp: number; // unix seconds
}

export interface RawPool {
  poolId: string;
  name: string;
  status: number;
  oracleId: string;
  backstopId: string;
  latestLedger: number;
  reserves: RawReserve[];
  oraclePrices: Record<string, Maybe<RawPrice>>;
  /** Liabilities held by the backstop's own position = bad debt, in token units per assetId. */
  backstopLiabilities: Maybe<Record<string, number>>;
  backstop: Maybe<{ totalSpotValueUsd: number; q4wPct: number }>;
}

export interface ReferencePrice {
  source: "reflector-cex" | "coingecko";
  price: Maybe<number>;
  error?: string;
}

export interface ReserveReport {
  assetId: string;
  code: Maybe<string>;
  supplied: number;
  borrowed: number;
  utilisation: number;
  maxUtil: number;
  supplyApr: number;
  borrowApr: number;
  cFactor: number;
  lFactor: number;
  oraclePrice: Maybe<number>;
  oracleAgeSec: Maybe<number>;
  suppliedUsd: Maybe<number>;
  borrowedUsd: Maybe<number>;
}

export interface OracleCheck {
  assetId: string;
  code: Maybe<string>;
  oraclePrice: Maybe<number>;
  oracleAgeSec: Maybe<number>;
  references: ReferencePrice[];
  gapPct: Maybe<number>; // signed, largest absolute gap vs any available reference
  stale: boolean;
  severity: Severity;
}

export interface BadDebtReport {
  totalUsd: Maybe<number>;
  byAsset: { assetId: string; code: Maybe<string>; amount: number; usd: Maybe<number> }[];
}

export interface StressBucket {
  label: string; // e.g. "HF < 1.00"
  min: number;
  max: number;
  count: number;
  liabilitiesUsd: number;
}

export interface StressReport {
  computedAt: string;
  trackedAccounts: number;
  accountsWithDebt: number;
  buckets: StressBucket[];
  note: string;
}

export interface PoolReport {
  network: NetworkName;
  poolId: string;
  name: string;
  status: number;
  statusLabel: string;
  oracleId: string;
  latestLedger: number;
  fetchedAt: string;
  reserves: ReserveReport[];
  totals: { suppliedUsd: Maybe<number>; borrowedUsd: Maybe<number>; utilisation: Maybe<number> };
  oracle: OracleCheck[];
  maxAbsGapPct: Maybe<number>;
  badDebt: BadDebtReport;
  backstop: Maybe<{ totalSpotValueUsd: number; q4wPct: number }>;
  stress: Maybe<StressReport>;
  warnings: string[];
}

export interface NetworkReport {
  network: NetworkName;
  fetchedAt: string;
  pools: PoolReport[];
  failedPools: { poolId: string; error: string }[];
  discoveryError: Maybe<string>;
}
