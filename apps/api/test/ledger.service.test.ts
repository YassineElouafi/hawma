import { describe, expect, it } from "vitest";
import { LedgerService, MemoryLedgerRepo, txnIdFor } from "../src/modules/ledger/ledger.service";
import { BookingsService, MemoryBookingRepo } from "../src/modules/bookings/bookings.service";
import { mad } from "../src/domain/money";

async function setup() {
  const repo = new MemoryBookingRepo(), bookings = new BookingsService(repo), ledger = new LedgerService(new MemoryLedgerRepo(), repo);
  const done = async (provider: string, total: number, method: "cash" | "card" | "wallet" = "cash") => {
    const b = await bookings.create(`c-${Math.random()}`, { mode: "catalogue", providerId: provider, totalCentimes: total, paymentMethod: method });
    for (const c of ["accept", "start_trip", "arrive", "start_job", "complete"] as const) await bookings.command(b.id, c, provider);
    await bookings.command(b.id, "confirm", b.customerId); return b;
  };
  return { ledger, done, bookings };
}

describe("ledger service", () => {
  it("settles a confirmed cash job: provider keeps 85%, owes the 15% fee", async () => {
    const s = await setup(); const b = await s.done("p1", mad(200));
    expect(await s.ledger.settleBooking(b.id)).toBe("posted");
    expect(await s.ledger.providerMoney("p1")).toMatchObject({ netEarningsCentimes: mad(170), cashOwedCentimes: mad(30) });
    expect(await s.ledger.totals()).toEqual({ platformRevenue: mad(30), cashHeld: mad(200), earnings: mad(170) });
  });
  it("is idempotent: replays (at-least-once delivery) never double-count", async () => {
    const s = await setup(); const b = await s.done("p1", mad(100));
    expect(await s.ledger.settleBooking(b.id)).toBe("posted");
    for (let i = 0; i < 5; i++) expect(await s.ledger.settleBooking(b.id)).toBe("duplicate");
    expect((await s.ledger.providerMoney("p1")).cashOwedCentimes).toBe(mad(15));
    expect(txnIdFor("booking:x:settle")).toBe(txnIdFor("booking:x:settle")); expect(txnIdFor("booking:x:settle")).not.toBe(txnIdFor("booking:y:settle"));
    expect(txnIdFor("a")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it("accumulates per provider and exposes batch cash-owed for dispatch", async () => {
    const s = await setup(); for (const [p, t] of [["p1", 100], ["p1", 300], ["p2", 1000]] as const) await s.ledger.settleBooking((await s.done(p, mad(t))).id);
    const owed = await s.ledger.cashOwedFor(["p1", "p2", "p3"]);
    expect([owed.get("p1"), owed.get("p2"), owed.get("p3")]).toEqual([mad(60), mad(150), 0]);
  });
  it("skips bookings with no provider, free jobs and unsupported payment methods", async () => {
    const s = await setup();
    const free = await s.done("p1", 0); expect(await s.ledger.settleBooking(free.id)).toBe("skipped");
    const wallet = await s.done("p1", mad(50), "wallet"); expect(await s.ledger.settleBooking(wallet.id)).toBe("skipped");
    const open = await s.bookings.create("c", { mode: "dispatch", totalCentimes: mad(10), paymentMethod: "cash" }); expect(await s.ledger.settleBooking(open.id)).toBe("skipped");
    expect(await s.ledger.settleBooking("00000000-0000-0000-0000-000000000000")).toBe("skipped");
  });
});
