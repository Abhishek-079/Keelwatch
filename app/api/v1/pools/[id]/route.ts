import { parseNetwork } from "@/lib/config";
import { getNetworkReport } from "@/lib/data";
import { HttpError, publicRoute } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = publicRoute(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const network = parseNetwork(new URL(req.url).searchParams.get("network"));
  const report = await getNetworkReport(network);
  const pool = report.pools.find((p) => p.poolId === id);
  if (!pool) {
    const failed = report.failedPools.find((p) => p.poolId === id);
    if (failed) throw new HttpError(503, failed.error);
    throw new HttpError(404, `Pool ${id} is not watched on ${network}`);
  }
  return pool;
});
