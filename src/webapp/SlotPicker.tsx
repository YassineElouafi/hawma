import { useEffect, useState } from "react";
import { Skeleton } from "@/components/arc/primitives";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { api } from "./api";

export interface Slot { date: string; startMin: number }
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Free-time picker for an offer: 7 days of slots for a given duration. Controlled via `value` / `onChange`. */
export function SlotPicker({ offerId, durationMin, value, onChange, emptyText }: { offerId: string; durationMin: number; value: Slot | null; onChange: (s: Slot | null) => void; emptyText: string }) {
  const { lang } = useI18n(); const [slots, setSlots] = useState<Slot[] | null>(null); const [dayIdx, setDayIdx] = useState(0);
  useEffect(() => { onChange(null); setSlots(null); setDayIdx(0); const from = new Date().toISOString().slice(0, 10); api(`/v1/offers/${offerId}/slots?from=${from}&days=7&durationMin=${durationMin}`, { auth: false }).then(setSlots).catch(() => setSlots([])); }, [offerId, durationMin]); // eslint-disable-line
  if (!slots) return <Skeleton className="mt-2 h-16" />;
  const days = [...new Set(slots.map((s) => s.date))]; if (!days.length) return <p className="mt-2 rounded-xl bg-ops-hover p-3 text-sm text-ops-muted">{emptyText}</p>;
  const label = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(lang === "fr" ? "fr-MA" : "ar-MA", { weekday: "short", day: "numeric" });
  const today = slots.filter((s) => s.date === days[dayIdx]);
  return (
    <>
      <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">{days.map((d, i) => <button key={d} onClick={() => { setDayIdx(i); onChange(null); }} className={cn("shrink-0 rounded-xl border px-3 py-1.5 text-sm font-semibold transition", dayIdx === i ? "border-ops-accent bg-ops-accent/10 text-ops-accent" : "border-ops-border bg-ops-card")}>{label(d)}</button>)}</div>
      <div className="mt-2 flex flex-wrap gap-2">{today.map((s) => { const on = value?.startMin === s.startMin && value?.date === s.date; return <button key={s.startMin} onClick={() => onChange(s)} aria-pressed={on} className={cn("rounded-lg border px-3 py-1.5 text-sm font-semibold tabular-nums transition", on ? "border-ops-accent bg-ops-accent text-ops-accent-fg" : "border-ops-border bg-ops-card hover:bg-ops-hover")}>{hhmm(s.startMin)}</button>; })}</div>
    </>
  );
}
