import { NETWORK_CONFIG, thresholds } from "@/lib/config";
import { getSql } from "@/lib/db";
import { channelsConfigured } from "@/lib/alerts/dispatch";
import { publicRoute } from "@/lib/api";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export const GET = publicRoute(async () => ({
  name: SITE.name,
  database: !!getSql(),
  alertChannels: channelsConfigured(),
  alertNetworks: (process.env.ALERT_NETWORKS || "mainnet").split(","),
  rpcHosts: {
    mainnet: new URL(NETWORK_CONFIG.mainnet.rpcUrl).host,
    testnet: new URL(NETWORK_CONFIG.testnet.rpcUrl).host,
  },
  thresholds: thresholds(),
}));
