import { parseNetwork } from "@/lib/config";
import { getNetworkReport } from "@/lib/data";
import { publicRoute } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = publicRoute(async (req) => {
  const network = parseNetwork(new URL(req.url).searchParams.get("network"));
  const r = await getNetworkReport(network);
  return {
    network,
    fetchedAt: r.fetchedAt,
    checks: r.pools.flatMap((p) => p.oracle.map((o) => ({ poolId: p.poolId, poolName: p.name, oracleId: p.oracleId, ...o }))),
  };
});
