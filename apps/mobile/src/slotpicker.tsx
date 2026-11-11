import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { api } from "./api";
import { C, R } from "./theme";
import { Card, CardSkeleton } from "./ui";

export interface Slot { date: string; startMin: number }
export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Free-time picker for an offer (7 days of slots for the given duration). */
export function SlotPicker({ offerId, durationMin, value, onChange, emptyText }: { offerId: string; durationMin: number; value: Slot | null; onChange: (s: Slot | null) => void; emptyText: string }) {
  const [slots, setSlots] = useState<Slot[] | null>(null); const [dayIdx, setDayIdx] = useState(0);
  useEffect(() => { onChange(null); setSlots(null); setDayIdx(0); const from = new Date().toISOString().slice(0, 10); api(`/v1/offers/${offerId}/slots?from=${from}&days=7&durationMin=${durationMin}`, { auth: false }).then(setSlots).catch(() => setSlots([])); }, [offerId, durationMin]); // eslint-disable-line
  if (!slots) return <CardSkeleton />;
  const days = [...new Set(slots.map((s) => s.date))]; if (!days.length) return <Card><Text style={{ color: C.mute }}>{emptyText}</Text></Card>;
  const label = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
  const today = slots.filter((s) => s.date === days[dayIdx]);
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>{days.map((d, i) => <Pressable key={d} onPress={() => { setDayIdx(i); onChange(null); }} style={{ marginRight: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.md, backgroundColor: dayIdx === i ? C.emeraldSoft : C.card, borderWidth: 1.5, borderColor: dayIdx === i ? C.emerald2 : C.border }}><Text style={{ fontWeight: "700", color: dayIdx === i ? C.emerald : C.ink }}>{label(d)}</Text></Pressable>)}</ScrollView>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>{today.map((s) => { const on = value?.startMin === s.startMin && value?.date === s.date; return <Pressable key={s.startMin} onPress={() => onChange(s)} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: R.md, backgroundColor: on ? C.emerald : C.card, borderWidth: 1, borderColor: on ? C.emerald : C.border }}><Text style={{ fontWeight: "700", color: on ? "#fff" : C.ink }}>{hhmm(s.startMin)}</Text></Pressable>; })}</View>
    </>
  );
}
