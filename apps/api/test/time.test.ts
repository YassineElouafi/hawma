import { describe, expect, it } from "vitest";
import { localParts, utcOffsetMinutes } from "../src/domain/time";

describe("Morocco local time", () => {
  it("is UTC+1 outside Ramadan", () => { expect(localParts(new Date("2026-11-10T09:00:00Z"))).toEqual({ date: "2026-11-10", startMin: 600 }); });
  it("is UTC+0 during Ramadan 2026", () => { expect(localParts(new Date("2026-03-01T09:00:00Z"))).toEqual({ date: "2026-03-01", startMin: 540 }); });
  it("rolls over the date at local midnight", () => { expect(localParts(new Date("2026-11-10T23:30:00Z"))).toEqual({ date: "2026-11-11", startMin: 30 }); });
  it("switches exactly at the Ramadan boundaries", () => {
    expect(utcOffsetMinutes(new Date("2026-02-17T12:00:00Z"))).toBe(60);
    expect(utcOffsetMinutes(new Date("2026-02-18T12:00:00Z"))).toBe(0);
    expect(utcOffsetMinutes(new Date("2026-03-20T12:00:00Z"))).toBe(0);
    expect(utcOffsetMinutes(new Date("2026-03-21T12:00:00Z"))).toBe(60);
  });
  it("is independent of the machine timezone / tzdata", () => {
    const keep = process.env.TZ; process.env.TZ = "America/Los_Angeles";
    expect(localParts(new Date("2026-11-10T09:00:00Z")).startMin).toBe(600);
    process.env.TZ = keep;
  });
});

import { localToUtc, slotAbs } from "../src/domain/time";
describe("local slot ↔ UTC", () => {
  it("converts Moroccan wall-clock slots to UTC, with Ramadan at UTC+0", () => {
    expect(localToUtc("2026-11-17", 540).toISOString()).toBe("2026-11-17T08:00:00.000Z");
    expect(localToUtc("2026-03-05", 540).toISOString()).toBe("2026-03-05T09:00:00.000Z");   // inside Ramadan 2026
    expect(localToUtc("2026-11-17", 30).toISOString()).toBe("2026-11-16T23:30:00.000Z");   // 00:30 local is the previous UTC day
  });
  it("round-trips through localParts across the year", () => {
    for (const date of ["2026-01-10", "2026-02-18", "2026-03-20", "2026-03-21", "2026-11-17", "2027-02-08"]) for (const m of [30, 540, 1200]) { const u = localToUtc(date, m); expect(localParts(u)).toEqual({ date, startMin: m }); }
  });
  it("slot indexes are monotonic across days", () => { expect(slotAbs("2026-11-18", 0)).toBe(slotAbs("2026-11-17", 1440)); expect(slotAbs("2026-11-17", 600)).toBeGreaterThan(slotAbs("2026-11-17", 599)); });
});
