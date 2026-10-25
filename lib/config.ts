import { Networks } from "@stellar/stellar-sdk";

export type NetworkName = "mainnet" | "testnet";
export const NETWORKS: NetworkName[] = ["mainnet", "testnet"];

export function parseNetwork(v: unknown): NetworkName {
  return v === "testnet" ? "testnet" : "mainnet";
}

/**
 * Contract addresses come from Blend's official repo
 * (github.com/blend-capital/blend-utils, mainnet.contracts.json / testnet.contracts.json)
 * and Stellar's oracle-provider docs (Reflector feeds).
 */
export const NETWORK_CONFIG: Record<
  NetworkName,
  {
    label: string;
    passphrase: string;
    rpcUrl: string;
    backstopId: string;
    knownPools: { id: string; note: string }[];
    reflectorCexFeed: string;
  }
> = {
  mainnet: {
    label: "Mainnet",
    passphrase: Networks.PUBLIC,
    rpcUrl: process.env.MAINNET_RPC_URL || "https://soroban-rpc.mainnet.stellar.gateway.fm",
    backstopId: "CAQQR5SWBXKIGZKPBZDH3KM5GQ5GUTPKB7JAFCINLZBC5WXPJKRG3IM7",
    knownPools: [
      { id: "CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD", note: "Listed as FixedV2 in blend-utils" },
      { id: "CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS", note: "YieldBlox V2 pool (exploited 22 Feb 2026)" },
    ],
    reflectorCexFeed: "CAFJZQWSED6YAWZU3GWRTOCNPPCGBN32L7QV43XX5LZLFTK6JLN34DLN",
  },
  testnet: {
    label: "Testnet",
    passphrase: Networks.TESTNET,
    rpcUrl: process.env.TESTNET_RPC_URL || "https://soroban-testnet.stellar.org",
    backstopId: "CBDVWXT433PRVTUNM56C3JREF3HIZHRBA64NB2C3B2UNCKIS65ZYCLZA",
    knownPools: [{ id: "CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF", note: "Blend testnet pool (TestnetV2)" }],
    reflectorCexFeed: "CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63",
  },
};

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== "" && process.env[name] !== undefined ? v : fallback;
}

export function extraPools(net: NetworkName): string[] {
  const raw = process.env[net === "mainnet" ? "EXTRA_POOLS_MAINNET" : "EXTRA_POOLS_TESTNET"] || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^C[A-Z2-7]{55}$/.test(s));
}

export function thresholds() {
  return {
    utilWarn: num("UTIL_WARN", 0.9),
    utilCrit: num("UTIL_CRIT", 0.98),
    gapWarnPct: num("ORACLE_GAP_WARN_PCT", 2),
    gapCritPct: num("ORACLE_GAP_CRIT_PCT", 10),
    oracleStaleSec: num("ORACLE_STALE_SEC", 1800),
    badDebtUsdWarn: num("BAD_DEBT_USD_WARN", 1),
    stressLiabUsdWarn: num("STRESS_LIAB_USD_WARN", 10000),
    q4wWarnPct: num("Q4W_WARN_PCT", 25),
    alertCooldownMin: num("ALERT_COOLDOWN_MIN", 60),
    alertRemindHours: num("ALERT_REMIND_HOURS", 6),
    alertMaxPerRun: num("ALERT_MAX_PER_RUN", 10),
  };
}
export type Thresholds = ReturnType<typeof thresholds>;

export const LIMITS = {
  maxPools: num("MAX_POOLS", 12),
  cacheSeconds: num("CACHE_SECONDS", 60),
  rateLimitPerMin: num("RATE_LIMIT_PER_MIN", 60),
  maxTrackedAccountsPerPool: num("MAX_TRACKED_ACCOUNTS_PER_POOL", 2000),
};

/** Reference sources work by asset code. Unknown codes get no reference (shown as "unavailable"). */
export const CODE_ALIASES: Record<string, string> = {
  native: "XLM",
  XLM: "XLM",
  USDC: "USDC",
  EURC: "EURC",
  USDT: "USDT",
  BTC: "BTC",
  WBTC: "BTC",
  ETH: "ETH",
  WETH: "ETH",
};

/** CoinGecko ids, only for coins whose id we are sure of. */
export const COINGECKO_IDS: Record<string, string> = {
  XLM: "stellar",
  USDC: "usd-coin",
  EURC: "euro-coin",
  USDT: "tether",
  BTC: "bitcoin",
  ETH: "ethereum",
};
