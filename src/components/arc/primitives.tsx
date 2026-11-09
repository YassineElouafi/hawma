import * as React from "react";
import { animate, motion, useInView, useMotionValue, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

/* ---------- Card ---------- */
export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("rounded-xl border border-ops-border bg-ops-card shadow-[0_1px_2px_rgb(0_0_0/.03)]", className)} {...p} />;
export const CardHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("flex items-start justify-between gap-3 px-5 pt-4", className)} {...p} />;
export const CardTitle = ({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className={cn("text-[13px] font-medium text-ops-muted", className)} {...p} />;
export const CardBody = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("px-5 pb-5 pt-3", className)} {...p} />;

/* ---------- Badges & status ---------- */
const tones = {
  neutral: "bg-ops-hover text-ops-muted", green: "bg-ops-green/12 text-ops-green", red: "bg-ops-red/12 text-ops-red", amber: "bg-ops-amber/18 text-[color-mix(in_oklab,var(--ops-amber)_70%,black)] dark:text-ops-amber",
  blue: "bg-ops-blue/12 text-ops-blue", violet: "bg-ops-violet/12 text-ops-violet", accent: "bg-ops-accent/12 text-ops-accent",
};
export type Tone = keyof typeof tones;
export const Pill = ({ tone = "neutral", dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode }) => (
  <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11.5px] font-medium", tones[tone], className)}>{dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}{children}</span>
);
export const stateTone = (s: string): Tone => ({ Requested: "amber", Offered: "amber", Accepted: "blue", EnRoute: "blue", Arrived: "blue", InProgress: "violet", Completed: "green", Confirmed: "green", Settled: "green", Disputed: "red", Cancelled: "red", Declined: "red", Expired: "neutral", Refunded: "amber" } as Record<string, Tone>)[s] ?? "neutral";

/* ---------- Avatar (deterministic colour from id) ---------- */
const hues = [155, 255, 295, 27, 75, 200, 330];
export function Avatar({ id, label, size = 28 }: { id: string; label?: string; size?: number }) {
  const h = hues[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length];
  return <span className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.4, background: `oklch(60% 0.14 ${h})` }}>{(label ?? id).slice(0, 2).toUpperCase()}</span>;
}

/* ---------- Skeleton / empty ---------- */
export const Skeleton = ({ className }: { className?: string }) => <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
export function Empty({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return <div className="grid place-items-center px-6 py-14 text-center"><div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-ops-hover text-ops-muted">{icon}</div><div className="font-medium">{title}</div>{hint && <div className="mt-1 max-w-xs text-ops-muted">{hint}</div>}</div>;
}

/* ---------- Segmented control ---------- */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-lg bg-ops-hover p-0.5" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)} className={cn("relative rounded-md px-3 py-1 text-[12.5px] font-medium transition-colors", value === o.id ? "text-ops-fg" : "text-ops-muted hover:text-ops-fg")}>
          {value === o.id && <motion.span layoutId="seg" className="absolute inset-0 rounded-md bg-ops-card shadow-sm ring-1 ring-ops-border" transition={{ type: "spring", damping: 30, stiffness: 400 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Count-up number ---------- */
export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString("en-US"), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null); const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0); const text = useTransform(mv, (v) => format(v));
  React.useEffect(() => { if (!inView) return; const c = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] }); return c.stop; }, [inView, value, mv]);
  return <motion.span ref={ref} className={cn("tabular-nums", className)}>{text}</motion.span>;
}

/* ---------- Charts (dependency-free SVG) ---------- */
function path(points: [number, number][]) { return points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" "); }
function smooth(points: [number, number][]) { // monotone-ish catmull-rom → cubic bezier
  if (points.length < 3) return path(points);
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) { const p0 = points[i - 1] ?? points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] ?? p2; const t = 0.18;
    d += ` C${p1[0] + (p2[0] - p0[0]) * t},${p1[1] + (p2[1] - p0[1]) * t} ${p2[0] - (p3[0] - p1[0]) * t},${p2[1] - (p3[1] - p1[1]) * t} ${p2[0]},${p2[1]}`; }
  return d;
}

export function Sparkline({ data, color = "var(--ops-accent)", height = 36, className }: { data: number[]; color?: string; height?: number; className?: string }) {
  const w = 120, max = Math.max(...data, 1), min = Math.min(...data, 0), span = max - min || 1;
  const pts = data.map((v, i) => [(i / Math.max(data.length - 1, 1)) * w, height - 3 - ((v - min) / span) * (height - 8)] as [number, number]);
  const id = React.useId();
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className={cn("w-full", className)} style={{ height }} preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".25" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${smooth(pts)} L${w},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <motion.path d={smooth(pts)} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: "easeOut" }} />
    </svg>
  );
}

export function AreaChart({ data, labels, format = (n: number) => String(n), color = "var(--ops-accent)", height = 220 }: { data: number[]; labels: string[]; format?: (n: number) => string; color?: string; height?: number }) {
  const W = 640, H = height, pad = { l: 36, r: 8, t: 12, b: 24 }; const [hover, setHover] = React.useState<number | null>(null);
  const max = Math.max(...data, 1) * 1.15; const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const pts = data.map((v, i) => [pad.l + (i / Math.max(data.length - 1, 1)) * iw, pad.t + ih - (v / max) * ih] as [number, number]);
  const id = React.useId(); const ticks = [0, 0.5, 1].map((t) => ({ y: pad.t + ih - t * ih, v: max * t }));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none" role="img" aria-label="Area chart"
        onMouseLeave={() => setHover(null)} onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(data.length - 1, Math.round(((x - pad.l) / iw) * (data.length - 1))))); }}>
        <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {ticks.map((t) => <g key={t.y}><line x1={pad.l} x2={W - pad.r} y1={t.y} y2={t.y} stroke="var(--ops-border)" strokeDasharray="3 4" /><text x={pad.l - 8} y={t.y + 4} textAnchor="end" fontSize="10" fill="var(--ops-muted)">{format(Math.round(t.v))}</text></g>)}
        <path d={`${smooth(pts)} L${pts[pts.length - 1][0]},${pad.t + ih} L${pts[0][0]},${pad.t + ih} Z`} fill={`url(#${id})`} />
        <motion.path d={smooth(pts)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeOut" }} />
        {labels.map((l, i) => (i % Math.ceil(labels.length / 7) === 0) && <text key={i} x={pts[i][0]} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--ops-muted)">{l}</text>)}
        {hover !== null && <g><line x1={pts[hover][0]} x2={pts[hover][0]} y1={pad.t} y2={pad.t + ih} stroke="var(--ops-border)" /><circle cx={pts[hover][0]} cy={pts[hover][1]} r="4" fill="var(--ops-card)" stroke={color} strokeWidth="2" /></g>}
      </svg>
      {hover !== null && <div className="pointer-events-none absolute top-1 rounded-lg border border-ops-border bg-ops-card px-2.5 py-1.5 text-xs shadow-lg" style={{ left: `clamp(0px, calc(${(pts[hover][0] / W) * 100}% - 40px), calc(100% - 96px))` }}><div className="text-ops-muted">{labels[hover]}</div><div className="font-semibold tabular-nums">{format(data[hover])}</div></div>}
    </div>
  );
}

export function BarList({ items }: { items: { label: string; value: number; tone?: string }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((it, i) => (
        <li key={it.label}><div className="mb-1 flex justify-between text-[12.5px]"><span>{it.label}</span><span className="tabular-nums text-ops-muted">{it.value}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ops-hover"><motion.div className="h-full rounded-full" style={{ background: it.tone ?? "var(--ops-accent)" }} initial={{ width: 0 }} animate={{ width: `${(it.value / max) * 100}%` }} transition={{ duration: 0.8, delay: i * 0.06, ease: "easeOut" }} /></div></li>
      ))}
    </ul>
  );
}

/* ---------- Stat tile ---------- */
export function StatTile({ label, value, format, delta, spark, color, icon, unit }: { label: string; value: number; unit?: string; format?: (n: number) => string; delta?: number | null; spark?: number[]; color?: string; icon?: React.ReactNode }) {
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader><CardTitle>{label}</CardTitle><span className="text-ops-muted">{icon}</span></CardHeader>
      <div className="flex min-h-[84px] items-end justify-between gap-3 px-5 pb-4 pt-2">
        <div>
          <div className="whitespace-nowrap text-[26px] font-semibold leading-none tracking-tight"><CountUp value={value} format={format} />{unit && <span className="ms-1 text-sm font-medium text-ops-muted">{unit}</span>}</div>
          {delta != null && <div className={cn("mt-2 text-xs font-medium", delta >= 0 ? "text-ops-green" : "text-ops-red")}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}% <span className="font-normal text-ops-muted">vs prev.</span></div>}
        </div>
        {spark && <div className="w-28 shrink-0"><Sparkline data={spark} color={color} /></div>}
      </div>
    </Card>
  );
}

/* ---------- Table ---------- */
export const Table = ({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) => <div className="ops-scroll overflow-x-auto"><table className={cn("w-full text-[13px]", className)} {...p} /></div>;
export const Th = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th className={cn("border-b border-ops-border px-4 py-2.5 text-start text-[11.5px] font-medium uppercase tracking-wide text-ops-muted", className)} {...p} />;
export const Td = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn("border-b border-ops-border/70 px-4 py-3 align-middle", className)} {...p} />;
export const Tr = ({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => <tr className={cn("transition-colors last:[&>td]:border-0", p.onClick && "cursor-pointer hover:bg-ops-hover", className)} {...p} />;

/* ---------- Buttons (Arc density) ---------- */
export const OBtn = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" | "danger"; size?: "sm" | "md" }>(({ className, variant = "outline", size = "md", ...p }, ref) => (
  <button ref={ref} className={cn("inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-accent",
    size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8.5 px-3.5 text-[13px]",
    variant === "primary" && "bg-ops-accent text-ops-accent-fg shadow-sm hover:brightness-110", variant === "outline" && "border border-ops-border bg-ops-card hover:bg-ops-hover",
    variant === "ghost" && "text-ops-muted hover:bg-ops-hover hover:text-ops-fg", variant === "danger" && "bg-ops-red text-white hover:brightness-110", className)} {...p} />
));
OBtn.displayName = "OBtn";
