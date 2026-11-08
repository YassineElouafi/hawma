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
