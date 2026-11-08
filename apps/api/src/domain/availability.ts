/** Slot computation (docs F3): weekly rules minus existing bookings, in 30-min steps. Times are minutes from local midnight. */
export interface Rule { weekday: number; startMin: number; endMin: number } // weekday 0=Sun
export interface Busy { date: string; startMin: number; endMin: number }   // date YYYY-MM-DD (local)
export interface Slot { date: string; startMin: number; endMin: number }

const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
export const addDays = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function slotsFor(rules: Rule[], busy: Busy[], fromDate: string, days: number, durationMin: number, opts: { stepMin?: number; noticeMin?: number; nowDate?: string; nowMin?: number } = {}): Slot[] {
  const step = opts.stepMin ?? 30, notice = opts.noticeMin ?? 60, out: Slot[] = [];
  if (durationMin <= 0 || durationMin % 1 !== 0) throw new Error("duration must be a positive integer");
  for (let i = 0; i < days; i++) {
    const date = addDays(fromDate, i);
    const dayBusy = busy.filter((b) => b.date === date);
    for (const r of rules.filter((x) => x.weekday === weekdayOf(date))) {
      for (let s = r.startMin; s + durationMin <= r.endMin; s += step) {
        const e = s + durationMin;
        if (opts.nowDate === date && opts.nowMin !== undefined && s < opts.nowMin + notice) continue;
        if (opts.nowDate && date < opts.nowDate) continue;
        if (dayBusy.some((b) => s < b.endMin && e > b.startMin)) continue; // overlap
        out.push({ date, startMin: s, endMin: e });
      }
    }
  }
  return out;
}
