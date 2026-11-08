/** Search re-ranking (docs §6.3): distance decay × quality, availability and reliability, with a labelled promo boost. */
export interface Hit { id: string; distanceM: number; rating: number; jobs: number; tier: number; availableThisWeek: boolean; responseMin: number; cancelRate: number; promoted?: boolean; textScore?: number }

export function rankScore(h: Hit, radiusM: number): number {
  const dist = Math.exp(-h.distanceM / Math.max(1, radiusM / 2));      // 1 at 0 m, ~0.37 at half radius
  const quality = ((h.rating - 1) / 4) * Math.log10(10 + h.jobs) / 2;  // rating, damped for few jobs; log10(10+jobs)/2 ∈ [0.5, ~1.5]
  const trust = h.tier / 3;
  const avail = h.availableThisWeek ? 1 : 0;
  const resp = 1 / (1 + h.responseMin / 30);
  return 0.30 * dist + 0.25 * quality + 0.10 * trust + 0.15 * avail + 0.10 * resp + 0.10 * (h.textScore ?? 0) - 0.30 * h.cancelRate + (h.promoted ? 0.05 : 0);
}
export const rankHits = <T extends Hit>(hs: T[], radiusM: number): T[] => [...hs].sort((a, b) => rankScore(b, radiusM) - rankScore(a, radiusM) || a.id.localeCompare(b.id));
