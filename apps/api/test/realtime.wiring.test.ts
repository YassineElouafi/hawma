import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { MemoryBus } from "../src/realtime/bus";
import { BusPublisher } from "../src/realtime/outbox-publisher";
import { bookingAccess, BookingsService, MemoryBookingRepo } from "../src/modules/bookings/bookings.service";

describe("realtime wiring", () => {
  it("booking access: participants only; location only for the assigned provider on an active job", async () => {
    const repo = new MemoryBookingRepo(), svc = new BookingsService(repo);
    const c = randomUUID(), p = randomUUID(), x = randomUUID();
    const b = await svc.create(c, { mode: "catalogue", providerId: p, totalCentimes: 1000, paymentMethod: "cash" });
    expect(await bookingAccess(repo, b.id, c)).toEqual({ participant: true, canShareLocation: false });
    expect(await bookingAccess(repo, b.id, x)).toEqual({ participant: false, canShareLocation: false });
    expect(await bookingAccess(repo, b.id, p)).toEqual({ participant: true, canShareLocation: false }); // still Requested
    await svc.command(b.id, "accept", p); await svc.command(b.id, "start_trip", p);
    expect((await bookingAccess(repo, b.id, p)).canShareLocation).toBe(true);
    expect((await bookingAccess(repo, b.id, c)).canShareLocation).toBe(false);
    await svc.command(b.id, "arrive", p); await svc.command(b.id, "start_job", p); await svc.command(b.id, "complete", p);
    expect((await bookingAccess(repo, b.id, p)).canShareLocation).toBe(false); // job finished → stop sharing
    expect(await bookingAccess(repo, randomUUID(), p)).toEqual({ participant: false, canShareLocation: false });
  });

  it("outbox publisher fans a booking event out to the booking and both users", async () => {
    const bus = new MemoryBus(), c = randomUUID(), p = randomUUID(), bid = randomUUID(); const got: string[] = [];
    await bus.subscribe(`booking:${bid}`, () => got.push("booking")); await bus.subscribe(`user:${c}`, () => got.push("customer")); await bus.subscribe(`user:${p}`, () => got.push("provider"));
    await new BusPublisher(bus, async () => [c, p]).publish("booking.accepted", "e1", { bookingId: bid, to: "Accepted" });
    expect(got.sort()).toEqual(["booking", "customer", "provider"]);
  });
});
