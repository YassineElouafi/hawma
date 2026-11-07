/** Dispatch ranking (docs §6.4). Pure and deterministic so it can be unit-tested and tuned. */
export interface Candidate {
  id: string; distanceM: number; etaS: number; rating: number; acceptance: number;
  idleMinutes: number; cancelRate: number; tier: 0 | 1 | 2 | 3; busy: boolean; blocked: boolean; cashOwed: number;
}
export interface Weights { eta: number; rating: number; acceptance: number; fairness: number; cancel: number }
export const DEFAULT_WEIGHTS: Weights = { eta: 0.4, rating: 0.2, acceptance: 0.2, fairness: 0.15, cancel: 0.25 };
export interface Job { requiredTier: 0 | 1 | 2 | 3; radiusM: number; cashOwedLimit: number }

export const eligible = (c: Candidate, j: Job): boolean =>
  !c.busy && !c.blocked && c.tier >= j.requiredTier && c.distanceM <= j.radiusM && c.cashOwed <= j.cashOwedLimit;

export function score(c: Candidate, w: Weights = DEFAULT_WEIGHTS): number {
  const eta = 1 / (1 + c.etaS / 300);              // 5 min ≈ 0.5
  const rating = (c.rating - 1) / 4;               // 1..5 → 0..1
  const fairness = Math.min(c.idleMinutes, 120) / 120;
  return w.eta * eta + w.rating * rating + w.acceptance * c.acceptance + w.fairness * fairness - w.cancel * c.cancelRate;
}

export const rank = (cs: Candidate[], j: Job, w?: Weights): Candidate[] =>
  cs.filter((c) => eligible(c, j)).map((c) => ({ c, s: score(c, w) })).sort((a, b) => b.s - a.s || a.c.id.localeCompare(b.c.id)).map((x) => x.c);

/** Radius widening schedule: ×2 up to 3 times, then "unfilled". */
export const nextRadius = (r: number, attempt: number): number | null => (attempt >= 3 ? null : r * 2);
