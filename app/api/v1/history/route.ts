import { parseNetwork } from "@/lib/config";
import { getHistory, getSql } from "@/lib/db";
import { HttpError, publicRoute } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = publicRoute(async (req) => {
  const sp = new URL(req.url).searchParams;
  const network = parseNetwork(sp.get("network"));
  const pool = sp.get("pool") ?? "";
  if (!/^C[A-Z2-7]{55}$/.test(pool)) throw new HttpError(400, "Query parameter 'pool' must be a pool contract id (C…)");
  const days = Math.min(90, Math.max(1, Math.floor(Number(sp.get("days") ?? 30)) || 30));
  const sql = getSql();
  if (!sql) throw new HttpError(503, "Database not configured; history unavailable");
  return { network, pool, days, points: await getHistory(sql, network, pool, days) };
});
