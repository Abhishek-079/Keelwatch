export const UNAVAILABLE = "unavailable";

export function usd(n: number | null | undefined, compact = true): string {
  if (n == null || !Number.isFinite(n)) return UNAVAILABLE;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact && Math.abs(n) >= 100_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2,
  }).format(n);
}

export function pct(n: number | null | undefined, digits = 1, ratio = false): string {
  if (n == null || !Number.isFinite(n)) return UNAVAILABLE;
  return `${(ratio ? n * 100 : n).toFixed(digits)}%`;
}

export function signedPct(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return UNAVAILABLE;
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function amount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return UNAVAILABLE;
  return new Intl.NumberFormat("en-US", { notation: Math.abs(n) >= 1e6 ? "compact" : "standard", maximumFractionDigits: 2 }).format(n);
}

export function price(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return UNAVAILABLE;
  return n >= 1 ? n.toFixed(4) : n.toPrecision(4);
}

export function age(sec: number | null | undefined): string {
  if (sec == null) return UNAVAILABLE;
  if (sec < 90) return `${Math.round(sec)}s ago`;
  if (sec < 5400) return `${Math.round(sec / 60)}m ago`;
  return `${(sec / 3600).toFixed(1)}h ago`;
}

export function shortId(id: string): string {
  return `${id.slice(0, 5)}…${id.slice(-5)}`;
}

export function explorer(net: string, id: string): string {
  return `https://stellar.expert/explorer/${net === "testnet" ? "testnet" : "public"}/contract/${id}`;
}
