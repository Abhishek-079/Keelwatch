import { parseNetwork } from "@/lib/config";
import { getSql, latestStress } from "@/lib/db";
import { HttpError, publicRoute } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = publicRoute(async (req) => {
  const network = parseNetwork(new URL(req.url).searchParams.get("network"));
  const sql = getSql();
  if (!sql) throw new HttpError(503, "Database not configured; stress view unavailable");
  return { network, pools: await latestStress(sql, network) };
});
