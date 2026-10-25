import { UNAVAILABLE } from "@/lib/format";

interface Props {
  title: string;
  points: { t: string; v: number | null }[];
  format: (n: number) => string;
  color?: string;
}

/** Small server-rendered SVG line chart. Gaps (null values) break the line instead of being invented. */
export function LineChart({ title, points, format, color = "var(--chart-1)" }: Props) {
  const W = 520;
  const H = 170;
  const pad = { l: 8, r: 8, t: 10, b: 22 };
  const vals = points.filter((p) => p.v != null) as { t: string; v: number }[];
  const last = vals.length ? vals[vals.length - 1].v : null;

  if (vals.length < 2) {
    return (
      <div className="card chart">
        <div className="title">{title}</div>
        <p className="na small" style={{ margin: "40px 0" }}>
          {vals.length === 0 ? "No history yet (unavailable)." : "Only one snapshot so far — the chart appears after the next one."}
        </p>
      </div>
    );
  }

  const t0 = new Date(points[0].t).getTime();
  const t1 = new Date(points[points.length - 1].t).getTime();
  let lo = Math.min(...vals.map((p) => p.v));
  let hi = Math.max(...vals.map((p) => p.v));
  if (lo === hi) {
    lo -= Math.abs(lo) * 0.05 || 1;
    hi += Math.abs(hi) * 0.05 || 1;
  }
  const x = (t: string) => pad.l + ((new Date(t).getTime() - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);

  const segments: string[] = [];
  let cur = "";
  for (const p of points) {
    if (p.v == null) {
      if (cur) segments.push(cur);
      cur = "";
      continue;
    }
    cur += `${cur ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
  }
  if (cur) segments.push(cur);

  const fmtDate = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <div className="card chart">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="title">{title}</div>
        <div className="mono small">{last == null ? UNAVAILABLE : format(last)}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} over time`}>
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line)" />
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        ))}
        <text x={pad.l} y={H - 6} fontSize="11" fill="var(--muted)">{fmtDate(t0)}</text>
        <text x={W - pad.r} y={H - 6} fontSize="11" fill="var(--muted)" textAnchor="end">{fmtDate(t1)}</text>
        <text x={W - pad.r} y={pad.t + 2} fontSize="11" fill="var(--muted)" textAnchor="end">max {format(hi)}</text>
      </svg>
    </div>
  );
}
