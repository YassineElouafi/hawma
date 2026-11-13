import * as React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Search, SlidersHorizontal, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { sceneOf } from "@/lib/scenes";

/* ---------- scene art (image-led cards without photos) ---------- */
export function SceneArt({ cat, className, children, emojiSize = 120, shade = true }: { cat: string; className?: string; children?: React.ReactNode; emojiSize?: number; shade?: boolean }) {
  const s = sceneOf(cat);
  return (
    <div className={cn("glide-zellige glide-grain relative isolate overflow-hidden", className)} style={{ background: `radial-gradient(120% 90% at 78% 8%, ${s.glow}55 0%, transparent 46%), linear-gradient(155deg, ${s.from}, ${s.to})` }}>
      <span aria-hidden className="pointer-events-none absolute -end-4 -top-3 select-none drop-shadow-[0_18px_24px_rgba(0,0,0,.25)]" style={{ fontSize: emojiSize, ["--r" as string]: "-10deg", animation: "g-float 7s ease-in-out infinite", lineHeight: 1 }}>{s.emoji}</span>
      <span aria-hidden className="pointer-events-none absolute -bottom-6 start-6 select-none opacity-25 blur-[1px]" style={{ fontSize: emojiSize * 0.7, lineHeight: 1 }}>{s.emoji}</span>
      {shade && <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />}
      {children}
    </div>
  );
}

/* ---------- buttons & chips ---------- */
export const IconBtn = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { dark?: boolean }>(({ className, dark, ...p }, ref) => (
  <button ref={ref} className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full transition active:scale-95", dark ? "bg-g-ink text-white" : "bg-white text-g-ink shadow-g-card", className)} {...p} />
));
IconBtn.displayName = "IconBtn";

export const CTA = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "ink" | "accent" | "ghost" | "danger" | "white" }>(({ className, tone = "ink", ...p }, ref) => (
  <button ref={ref} className={cn("inline-flex h-14 w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold transition active:scale-[.985] disabled:pointer-events-none disabled:opacity-40",
    tone === "ink" && "bg-g-ink text-white shadow-g-card hover:bg-black", tone === "accent" && "bg-g-accent text-white hover:brightness-110", tone === "white" && "bg-white text-g-ink shadow-g-card",
    tone === "ghost" && "bg-transparent text-g-ink hover:bg-black/5", tone === "danger" && "bg-g-danger-soft text-g-danger", className)} {...p} />
));
CTA.displayName = "CTA";

export const Chip = ({ on, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) => (
  <button aria-pressed={on} className={cn("shrink-0 rounded-full px-5 py-3 text-[14px] font-semibold transition active:scale-95", on ? "bg-g-ink text-white" : "bg-white text-g-mute shadow-[0_1px_2px_rgb(17_18_20/.05)] hover:text-g-ink", className)} {...p} />
);

export const Tag = ({ tone = "neutral", className, children }: { tone?: "neutral" | "accent" | "green" | "danger" | "amber"; className?: string; children: React.ReactNode }) => (
  <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold", tone === "neutral" && "bg-black/5 text-g-mute", tone === "accent" && "bg-g-accent-soft text-g-accent", tone === "green" && "bg-g-green-soft text-g-green", tone === "danger" && "bg-g-danger-soft text-g-danger", tone === "amber" && "bg-[#fdf1d6] text-[#8a5a00]", className)}>{children}</span>
);

export const RatingPill = ({ value, count, onDark, className }: { value: number; count?: number; onDark?: boolean; className?: string }) => (
  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold", onDark ? "bg-white/15 text-white backdrop-blur" : "bg-black/5 text-g-ink", className)}>
    <Star size={14} strokeWidth={2.2} className={onDark ? "text-white" : "text-g-ink"} />{value.toFixed(1)}{count != null && <span className={cn("font-medium", onDark ? "text-white/75" : "text-g-mute")}>({count})</span>}
  </span>
);

export const UnderLink = ({ className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button className={cn("text-[14px] font-semibold text-g-ink underline decoration-g-ink/40 underline-offset-[5px] transition hover:decoration-g-ink", className)} {...p} />;

export const ArrowBtn = ({ className, onDark, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { onDark?: boolean }) => (
  <button className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-full transition active:scale-95", onDark ? "bg-white text-g-ink" : "bg-g-ink text-white", className)} {...p}><ArrowRight size={20} className="rtl:rotate-180" /></button>
);

/* ---------- avatar ---------- */
const hues = [[22, 160], [250, 200], [330, 30], [150, 90], [200, 260], [40, 10]];
export function Avatar({ id, label, size = 44, className }: { id: string; label?: string; size?: number; className?: string }) {
  const [a, b] = hues[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % hues.length];
  return <span className={cn("inline-grid shrink-0 place-items-center rounded-full font-bold text-white ring-2 ring-white", className)} style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, oklch(52% .14 ${a}), oklch(62% .16 ${b}))` }}>{(label ?? id).slice(0, 2).toUpperCase()}</span>;
}

/* ---------- search bar with dark filter button ---------- */
export function SearchBar({ value, onChange, placeholder, onFilter, filterLabel }: { value: string; onChange: (v: string) => void; placeholder: string; onFilter?: () => void; filterLabel?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white py-2 pe-2 ps-5 shadow-g-card">
      <Search size={20} className="text-g-ink" strokeWidth={2.2} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-10 min-w-0 flex-1 bg-transparent text-[16px] font-medium outline-none placeholder:text-g-mute" />
      <IconBtn dark aria-label={filterLabel ?? "Filters"} onClick={onFilter} className="h-11 w-11"><SlidersHorizontal size={18} /></IconBtn>
    </div>
  );
}

/* ---------- floating pill tab bar ---------- */
export function FloatingTabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; icon: React.ReactNode; label: string }[] }) {
  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[480px] justify-center px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex w-full items-center justify-between rounded-full bg-g-ink p-2.5 shadow-g-float">
        {items.map((it) => (
          <button key={it.id} onClick={() => onChange(it.id)} aria-label={it.label} aria-current={value === it.id ? "page" : undefined} className="relative grid h-14 flex-1 place-items-center rounded-full">
            {value === it.id && <motion.span layoutId="g-tab" className="absolute inset-0 rounded-full bg-white" transition={{ type: "spring", damping: 28, stiffness: 380 }} />}
            <span className={cn("relative transition-colors", value === it.id ? "text-g-ink" : "text-white/80")}>{it.icon}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/* ---------- sheet sliding over content ---------- */
export function GSheet({ open, onClose, title, children, tall }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; tall?: boolean }) {
  return (
    <>
      {open && <motion.div className="fixed inset-0 z-40 bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} />}
      {open && (
        <motion.div role="dialog" aria-label={title} initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 32, stiffness: 320 }}
          className={cn("glide fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-[480px] flex-col rounded-t-[2rem] bg-g-bg shadow-2xl", tall ? "max-h-[94dvh]" : "max-h-[88dvh]")}>
          <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-black/15" />
          <div className="overflow-y-auto px-5 pb-8 pt-3">{children}</div>
        </motion.div>
      )}
    </>
  );
}

export const Section = ({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <section className={cn("mt-8", className)}><div className="mb-3.5 flex items-end justify-between px-5"><h2 className="text-[22px] leading-none">{title}</h2>{action}</div>{children}</section>
);

export const Skeleton = ({ className }: { className?: string }) => <div className={cn("animate-pulse rounded-[1.75rem] bg-black/[.06]", className)} aria-hidden />;
export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("rounded-[1.75rem] bg-white shadow-g-card", className)} {...p} />;
