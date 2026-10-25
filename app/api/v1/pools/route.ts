import { parseNetwork } from "@/lib/config";
import { getNetworkReport } from "@/lib/data";
import { HttpError, publicRoute } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = publicRoute(async (req) => {
  const network = parseNetwork(new URL(req.url).searchParams.get("network"));
  const report = await getNetworkReport(network);
  if (report.pools.length === 0 && report.failedPools.length > 0) {
    throw new HttpError(503, `No pool could be read: ${report.failedPools[0].error}`);
  }
  return report;
});
