import type { Thresholds } from "../config";
import type { Sql } from "../db";
import type { AlertCandidate, AlertSeverity } from "./rules";

export interface AlertState {
  key: string;
  active: boolean;
  severity: string;
  lastSentAt: Date | null;
}

export interface OutgoingAlert {
  key: string;
  rule: string;
  network: string;
  poolId: string;
  severity: AlertSeverity | "resolved";
  text: string;
}

export interface Decision {
  send: OutgoingAlert[];
  suppressed: number;
  upserts: { key: string; active: boolean; severity: string; sent: boolean }[];
}

const rank = (s: string) => (s === "critical" ? 2 : s === "warn" ? 1 : 0);
const emoji = (s: string) => (s === "critical" ? "🔴" : s === "warn" ? "🟠" : "🟢");

function render(c: AlertCandidate, siteUrl: string): string {
  const link = siteUrl ? `\n${siteUrl}/pools/${c.poolId}?network=${c.network}` : "";
  return `${emoji(c.severity)} [${c.network}] ${c.poolName}: ${c.message}${link}`;
}

/**
 * Pure decision logic (tested without network or database).
 * - New condition: send, unless the same key was sent within the cooldown (flapping).
 * - Ongoing condition: send again only if it got worse, or as a reminder after N hours.
 * - Condition gone: send one "resolved" message if cooldown has passed, then mark inactive.
 * - At most `alertMaxPerRun` messages per run; the rest are counted as suppressed.
 */
export function decideAlerts(
  candidates: AlertCandidate[],
  states: Map<string, AlertState>,
  evaluatedPrefixes: string[],
  now: Date,
  t: Thresholds,
  siteUrl = "",
): Decision {
  const cooldownMs = t.alertCooldownMin * 60_000;
  const remindMs = t.alertRemindHours * 3_600_000;
  const send: OutgoingAlert[] = [];
  const upserts: Decision["upserts"] = [];
  const seen = new Set<string>();

  for (const c of candidates) {
    seen.add(c.key);
    const st = states.get(c.key);
    const since = st?.lastSentAt ? now.getTime() - st.lastSentAt.getTime() : Infinity;
    let should = false;
    if (!st || !st.active) should = since >= cooldownMs;
    else if (rank(c.severity) > rank(st.severity)) should = true;
    else should = since >= remindMs;
    upserts.push({ key: c.key, active: true, severity: c.severity, sent: should });
    if (should) {
      send.push({ key: c.key, rule: c.rule, network: c.network, poolId: c.poolId, severity: c.severity, text: render(c, siteUrl) });
    }
  }

  for (const st of states.values()) {
    if (!st.active || seen.has(st.key)) continue;
    if (!evaluatedPrefixes.some((p) => st.key.startsWith(p))) continue; // pool not checked this run
    const since = st.lastSentAt ? now.getTime() - st.lastSentAt.getTime() : Infinity;
    const notify = st.lastSentAt != null && since >= cooldownMs;
    const [network, poolId, rule] = st.key.split(":");
    upserts.push({ key: st.key, active: false, severity: st.severity, sent: notify });
    if (notify) {
      send.push({
        key: st.key,
        rule,
        network,
        poolId,
        severity: "resolved",
        text: `🟢 [${network}] Resolved: ${rule.replace("_", " ")} on pool ${poolId.slice(0, 4)}…${poolId.slice(-4)} is back within limits.`,
      });
    }
  }

  // Critical first, then cap.
  send.sort((a, b) => rank(b.severity) - rank(a.severity));
  const capped = send.slice(0, t.alertMaxPerRun);
  const dropped = new Set(send.slice(t.alertMaxPerRun).map((s) => s.key));
  for (const u of upserts) if (dropped.has(u.key)) u.sent = false;
  return { send: capped, suppressed: dropped.size, upserts };
}

export async function sendTelegram(text: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true }),
    signal: AbortSignal.timeout(8000),
  });
  return res.ok;
}

export async function sendDiscord(text: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return false;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: text.slice(0, 1900), allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(8000),
  });
  return res.ok;
}

export function channelsConfigured() {
  return {
    telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    discord: !!process.env.DISCORD_WEBHOOK_URL,
  };
}

/** Reads state, decides, sends, writes state + log. Requires the database (for cooldowns). */
export async function runAlerts(
  sql: Sql,
  candidates: AlertCandidate[],
  evaluatedPrefixes: string[],
  t: Thresholds,
  now = new Date(),
  fetchImpl: typeof fetch = fetch,
) {
  const rows = await sql`SELECT key, active, severity, last_sent_at FROM alert_state`;
  const states = new Map<string, AlertState>();
  for (const r of rows) {
    states.set(r.key as string, {
      key: r.key as string,
      active: r.active as boolean,
      severity: r.severity as string,
      lastSentAt: r.last_sent_at ? new Date(r.last_sent_at as string) : null,
    });
  }
  const decision = decideAlerts(candidates, states, evaluatedPrefixes, now, t, process.env.PUBLIC_SITE_URL || "");

  const results: { key: string; channels: string[] }[] = [];
  for (const a of decision.send) {
    const channels: string[] = [];
    try {
      if (await sendTelegram(a.text, fetchImpl)) channels.push("telegram");
    } catch {
      /* logged as not delivered */
    }
    try {
      if (await sendDiscord(a.text, fetchImpl)) channels.push("discord");
    } catch {
      /* logged as not delivered */
    }
    results.push({ key: a.key, channels });
    await sql`INSERT INTO alert_log (key, network, pool_id, rule, severity, message, resolved, channels)
      VALUES (${a.key}, ${a.network}, ${a.poolId}, ${a.rule}, ${a.severity}, ${a.text}, ${a.severity === "resolved"}, ${channels.join(",")})`;
  }
  for (const u of decision.upserts) {
    await sql`INSERT INTO alert_state (key, active, severity, last_sent_at, updated_at)
      VALUES (${u.key}, ${u.active}, ${u.severity}, ${u.sent ? now.toISOString() : null}, ${now.toISOString()})
      ON CONFLICT (key) DO UPDATE SET active = EXCLUDED.active, severity = EXCLUDED.severity,
        last_sent_at = COALESCE(EXCLUDED.last_sent_at, alert_state.last_sent_at), updated_at = EXCLUDED.updated_at`;
  }
  return { sent: results, suppressed: decision.suppressed };
}
