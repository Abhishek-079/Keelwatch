import { NextResponse } from "next/server";
import { runSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Called by Vercel Cron (sends "Authorization: Bearer $CRON_SECRET" automatically)
 * or by the GitHub Actions schedule. Refuses everyone else.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: "CRON_SECRET is not set (min 16 characters)" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const summary = await runSnapshot();
  return NextResponse.json({ ok: true, ms: Date.now() - started, summary });
}
