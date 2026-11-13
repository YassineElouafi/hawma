import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { Skeleton } from "@/components/glide/ui";
import { api } from "./api";

export interface Slot { date: string; startMin: number }
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Free-time picker for an offer: 7 days of slots for a given duration (Glide style: black = selected). */
export function SlotPicker({ offerId, durationMin, value, onChange, emptyText }: { offerId: string; durationMin: number; value: Slot | null; onChange: (s: Slot | null) => void; emptyText: string }) {
  const { lang } = useI18n(); const [slots, setSlots] = useState<Slot[] | null>(null); const [dayIdx, setDayIdx] = useState(0);
  useEffect(() => { onChange(null); setSlots(null); setDayIdx(0); const from = new Date().toISOString().slice(0, 10); api(`/v1/offers/${offerId}/slots?from=${from}&days=7&durationMin=${durationMin}`, { auth: false }).then(setSlots).catch(() => setSlots([])); }, [offerId, durationMin]); // eslint-disable-line
  if (!slots) return <Skeleton className="mt-2 h-20" />;
  const days = [...new Set(slots.map((s) => s.date))]; if (!days.length) return <p className="mt-2 rounded-2xl bg-black/5 p-4 text-sm text-g-mute">{emptyText}</p>;
  const loc = lang === "fr" ? "fr-MA" : "ar-MA";
  const dow = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(loc, { weekday: "short" }); const dom = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(loc, { day: "numeric" });
  const today = slots.filter((s) => s.date === days[dayIdx]);
  return (
    <>
      <div className="no-scrollbar -mx-5 mt-3 flex gap-2.5 overflow-x-auto px-5">{days.map((d, i) => <button key={d} onClick={() => { setDayIdx(i); onChange(null); }} aria-pressed={dayIdx === i} className={cn("flex w-16 shrink-0 flex-col items-center rounded-2xl py-2.5 transition active:scale-95", dayIdx === i ? "bg-g-ink text-white" : "bg-white text-g-ink shadow-g-card")}><span className={cn("text-[11px] font-semibold uppercase", dayIdx === i ? "text-white/75" : "text-g-mute")}>{dow(d)}</span><span className="text-xl font-bold leading-tight">{dom(d)}</span></button>)}</div>
      <div className="mt-3.5 flex flex-wrap gap-2.5">{today.map((s) => { const on = value?.startMin === s.startMin && value?.date === s.date; return <button key={s.startMin} onClick={() => onChange(s)} aria-pressed={on} className={cn("rounded-full px-5 py-3 text-[14px] font-bold tabular-nums transition active:scale-95", on ? "bg-g-accent text-white" : "bg-white text-g-ink shadow-g-card")}>{hhmm(s.startMin)}</button>; })}</div>
    </>
  );
}
