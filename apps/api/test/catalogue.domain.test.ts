import { describe, expect, it } from "vitest";
import { bbox, fuzz, haversineM } from "../src/domain/geo";
import { slotsFor } from "../src/domain/availability";
import { rankHits, rankScore, type Hit } from "../src/domain/ranking";

describe("geo", () => {
  it("haversine: Maarif → Ain Diab is about 4 km", () => {
    const d = haversineM(33.5883, -7.635, 33.595, -7.67);
    expect(d).toBeGreaterThan(3000); expect(d).toBeLessThan(4500);
    expect(haversineM(1, 1, 1, 1)).toBe(0);
  });
  it("bbox contains every point within the radius", () => {
    const c = { lat: 33.58, lng: -7.63 }, r = 3000, b = bbox(c.lat, c.lng, r);
    for (let a = 0; a < 360; a += 15) {
      const lat = c.lat + (r * 0.99 / 111_320) * Math.cos((a * Math.PI) / 180), lng = c.lng + (r * 0.99 / (111_320 * Math.cos((c.lat * Math.PI) / 180))) * Math.sin((a * Math.PI) / 180);
      expect(haversineM(c.lat, c.lng, lat, lng)).toBeLessThanOrEqual(r);
      expect(lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng).toBe(true);
    }
  });
  it("fuzz moves a point by at most ~300 m and is stable on the grid", () => {
    const f = fuzz(33.58123, -7.63456);
    expect(haversineM(33.58123, -7.63456, f.lat, f.lng)).toBeLessThan(300);
    const g = fuzz(f.lat, f.lng); expect(g.lat).toBeCloseTo(f.lat, 9); expect(g.lng).toBeCloseTo(f.lng, 9);
  });
});

describe("slotsFor", () => {
  const rules = [{ weekday: 2, startMin: 9 * 60, endMin: 12 * 60 }]; // Tuesdays 09–12
  it("generates 30-min stepped slots for a 2 h job on the right weekday only", () => {
    const s = slotsFor(rules, [], "2026-11-09", 7, 120); // 2026-11-10 is a Tuesday
    expect(s.every((x) => x.date === "2026-11-10")).toBe(true);
    expect(s.map((x) => x.startMin)).toEqual([540, 570, 600]); // 09:00, 09:30, 10:00
  });
  it("removes overlapping bookings but keeps adjacent ones", () => {
    const s = slotsFor(rules, [{ date: "2026-11-10", startMin: 600, endMin: 660 }], "2026-11-10", 1, 60);
    expect(s.map((x) => x.startMin)).toEqual([540, 660]); // 09:30–10:30 overlaps the 10:00 booking; 09:00–10:00 is adjacent and fine
  });
  it("respects minimum notice today", () => {
    const s = slotsFor(rules, [], "2026-11-10", 1, 60, { nowDate: "2026-11-10", nowMin: 9 * 60, noticeMin: 60 });
    expect(s.map((x) => x.startMin)).toEqual([600, 630, 660]);
  });
  it("rejects a zero duration", () => { expect(() => slotsFor(rules, [], "2026-11-10", 1, 0)).toThrow(); });
});

describe("ranking", () => {
  const base: Hit = { id: "a", distanceM: 500, rating: 4.6, jobs: 40, tier: 2, availableThisWeek: true, responseMin: 10, cancelRate: 0.01 };
  it("closer beats farther, all else equal", () => { expect(rankScore(base, 5000)).toBeGreaterThan(rankScore({ ...base, distanceM: 4000 }, 5000)); });
  it("a 5★ with 1 job does not outrank a 4.7★ with 200 jobs nearby", () => {
    const novice = { ...base, id: "n", rating: 5, jobs: 1 }, pro = { ...base, id: "p", rating: 4.7, jobs: 200 };
    expect(rankHits([novice, pro], 5000)[0].id).toBe("p");
  });
  it("cancellations and unavailability are penalised; promo gives only a small boost", () => {
    expect(rankScore({ ...base, cancelRate: 0.3 }, 5000)).toBeLessThan(rankScore(base, 5000));
    expect(rankScore({ ...base, availableThisWeek: false }, 5000)).toBeLessThan(rankScore(base, 5000));
    const boost = rankScore({ ...base, promoted: true }, 5000) - rankScore(base, 5000);
    expect(boost).toBeGreaterThan(0); expect(boost).toBeLessThan(0.06);
  });
  it("is deterministic on ties", () => { expect(rankHits([{ ...base, id: "b" }, { ...base, id: "a" }], 5000).map((h) => h.id)).toEqual(["a", "b"]); });
});
