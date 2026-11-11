/**
 * Morocco local time: UTC+1 all year, except UTC+0 during Ramadan (since 2018).
 *
 * We deliberately do NOT rely on tzdata: on 2026-11-08 both the Postgres 16 image and GitHub's Node 22 resolved
 * "Africa/Casablanca" as UTC+0 in November while a local Node with tzdata 2024b said UTC+1. Booking times are a legal and
 * financial matter, so the rule is explicit and versioned here. The Ramadan windows are announced by the government each year:
 * UPDATE THIS TABLE (and its test) every year; dates below are approximate until officially published.
 */
export const RAMADAN_UTC0: { from: string; to: string }[] = [ // inclusive local calendar dates, YYYY-MM-DD
  { from: "2026-02-18", to: "2026-03-20" },
  { from: "2027-02-08", to: "2027-03-09" },
];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function utcOffsetMinutes(at: Date): 0 | 60 {
  const asPlusOne = ymd(new Date(at.getTime() + 60 * 60_000)); // calendar day under the default offset
  return RAMADAN_UTC0.some((r) => asPlusOne >= r.from && asPlusOne <= r.to) ? 0 : 60;
}

export function localParts(at: Date): { date: string; startMin: number } {
  const local = new Date(at.getTime() + utcOffsetMinutes(at) * 60_000);
  return { date: ymd(local), startMin: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

/** Inverse of localParts: a Moroccan wall-clock date + minute-of-day → the UTC instant. (The Ramadan switch is modelled on calendar dates, so wall times within the hour either side of the switch-over midnight are ambiguous; no bookable slot lives there.) */
export function localToUtc(date: string, startMin: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, 0, startMin);                       // pretend the wall clock is UTC
  const plusOne = new Date(asUtc - 60 * 60_000);                          // default offset: UTC+1
  return utcOffsetMinutes(plusOne) === 60 ? plusOne : new Date(asUtc);    // Ramadan: UTC+0
}
/** Absolute minute index of a local slot (days since 2020-01-01 × 1440 + minute) — comparable across days, used for overlap checks. */
export const slotAbs = (date: string, startMin: number) => { const [y, m, d] = date.split("-").map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2020, 0, 1)) / 60_000) + startMin; };
