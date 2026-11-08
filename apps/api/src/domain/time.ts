/**
 * Morocco local time (Africa/Casablanca: UTC+1, UTC+0 during Ramadan).
 * We compute local date/minute in the APPLICATION (Node/ICU tzdata) and persist them next to the UTC instant,
 * because the Postgres build in our CI image resolves this zone as UTC+0 all year (verified 2026-11-08).
 */
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function localParts(at: Date): { date: string; startMin: number } {
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, startMin: Number(p.hour) * 60 + Number(p.minute) };
}
