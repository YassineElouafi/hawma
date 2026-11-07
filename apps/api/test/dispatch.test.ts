import { describe, expect, it } from "vitest";
import { eligible, nextRadius, rank, score, type Candidate } from "../src/domain/dispatch";

const c = (o: Partial<Candidate> & { id: string }): Candidate => ({ distanceM: 1000, etaS: 300, rating: 4.5, acceptance: 0.8, idleMinutes: 10, cancelRate: 0.02, tier: 2, busy: false, blocked: false, cashOwed: 0, ...o });
const job = { requiredTier: 1 as const, radiusM: 3000, cashOwedLimit: 30000 };

describe("dispatch", () => {
  it("filters ineligible candidates", () => {
    expect(eligible(c({ id: "a", busy: true }), job)).toBe(false);
    expect(eligible(c({ id: "a", blocked: true }), job)).toBe(false);
    expect(eligible(c({ id: "a", tier: 0 }), job)).toBe(false);
    expect(eligible(c({ id: "a", distanceM: 4000 }), job)).toBe(false);
    expect(eligible(c({ id: "a", cashOwed: 40000 }), job)).toBe(false);
    expect(eligible(c({ id: "a" }), job)).toBe(true);
  });
  it("prefers closer providers, all else equal", () => {
    const r = rank([c({ id: "far", etaS: 900 }), c({ id: "near", etaS: 120 })], job);
    expect(r.map((x) => x.id)).toEqual(["near", "far"]);
  });
  it("fairness lifts long-idle providers; cancellations hurt", () => {
    expect(score(c({ id: "a", idleMinutes: 90 }))).toBeGreaterThan(score(c({ id: "b", idleMinutes: 0 })));
    expect(score(c({ id: "a", cancelRate: 0.3 }))).toBeLessThan(score(c({ id: "b", cancelRate: 0 })));
  });
  it("is deterministic on ties", () => {
    expect(rank([c({ id: "b" }), c({ id: "a" })], job).map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("radius widens ×2 then gives up", () => {
    expect([nextRadius(3000, 0), nextRadius(6000, 1), nextRadius(12000, 2), nextRadius(24000, 3)]).toEqual([6000, 12000, 24000, null]);
  });
});
