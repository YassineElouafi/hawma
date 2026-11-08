import { describe, expect, it } from "vitest";
import { localParts } from "../src/domain/time";

describe("Morocco local time", () => {
  it("is UTC+1 outside Ramadan", () => { expect(localParts(new Date("2026-11-10T09:00:00Z"))).toEqual({ date: "2026-11-10", startMin: 600 }); });
  it("is UTC+0 during Ramadan 2026", () => { expect(localParts(new Date("2026-03-01T09:00:00Z"))).toEqual({ date: "2026-03-01", startMin: 540 }); });
  it("rolls over the date at local midnight", () => { expect(localParts(new Date("2026-11-10T23:30:00Z"))).toEqual({ date: "2026-11-11", startMin: 30 }); });
});
