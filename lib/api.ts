import { NextResponse } from "next/server";
import { LIMITS } from "./config";

/**
 * Simple per-IP fixed-window limiter, kept in memory.
 * On Vercel each server instance has its own memory, so this is best-effort;
 * CDN caching (s-maxage) below absorbs most repeated traffic anyway.
 */
const hits = new Map<string, { windowStart: number; count: number }>();

export function rateLimit(key: string, limit = LIMITS.rateLimitPerMin, windowMs = 60_000, now = Date.now()) {
  const h = hits.get(key);
  if (!h || now - h.windowStart >= windowMs) {
    hits.set(key, { windowStart: now, count: 1 });
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (now - v.windowStart >= windowMs) hits.delete(k);
    }
    return { ok: true, remaining: limit - 1, resetMs: windowMs };
  }
  h.count++;
  return { ok: h.count <= limit, remaining: Math.max(0, limit - h.count), resetMs: windowMs - (now - h.windowStart) };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim();
}

/** Wraps a public GET handler with rate limiting, CORS and cache headers. */
export function publicRoute<C>(handler: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    const rl = rateLimit(clientIp(req));
    const headers = {
      "access-control-allow-origin": "*",
      "x-ratelimit-remaining": String(rl.remaining),
    };
    if (!rl.ok) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many requests. Try again in a minute." },
        { status: 429, headers: { ...headers, "retry-after": String(Math.ceil(rl.resetMs / 1000)) } },
      );
    }
    try {
      const body = await handler(req, ctx);
      return NextResponse.json(body, {
        headers: { ...headers, "cache-control": "public, s-maxage=60, stale-while-revalidate=120" },
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      return NextResponse.json(
        { error: err.status === 404 ? "not_found" : "upstream_unavailable", message: err.message },
        { status: err.status ?? 503, headers },
      );
    }
  };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
