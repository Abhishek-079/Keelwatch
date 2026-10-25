import { parseNetwork } from "@/lib/config";
import { getSql, recentAlerts } from "@/lib/db";
import { HttpError, publicRoute } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = publicRoute(async (req) => {
  const sp = new URL(req.url).searchParams;
  const network = parseNetwork(sp.get("network"));
  const limit = Math.min(200, Math.max(1, Math.floor(Number(sp.get("limit") ?? 50)) || 50));
  const sql = getSql();
  if (!sql) throw new HttpError(503, "Database not configured; alert log unavailable");
  return { network, alerts: await recentAlerts(sql, network, limit) };
});
