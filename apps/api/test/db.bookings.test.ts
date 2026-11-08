import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { randomUUID } from "node:crypto";
import { PgBookingRepo } from "../src/modules/bookings/pg-booking.repo";
import { BookingsService } from "../src/modules/bookings/bookings.service";
import { relayOutbox } from "../src/modules/bookings/outbox.relay";

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;

d("Postgres booking repo + outbox (real Postgres)", () => {
  let client: ReturnType<typeof postgres>; let db: ReturnType<typeof drizzle>; let svc: BookingsService;
  beforeAll(() => { client = postgres(url!, { max: 4 }); db = drizzle(client); svc = new BookingsService(new PgBookingRepo(db)); });
  afterAll(async () => { await client.end(); });

  it("persists the lifecycle with events and an outbox row per transition", async () => {
    const customer = randomUUID(), provider = randomUUID();
    const b = await svc.create(customer, { mode: "catalogue", providerId: provider, totalCentimes: 10000, paymentMethod: "cash" });
    await svc.command(b.id, "accept", provider);
    await svc.command(b.id, "start_trip", provider);
    const got = await svc.get(b.id, customer);
    expect(got.state).toBe("EnRoute");
    expect(got.version).toBe(2);
    expect(got.events.map((e) => e.type)).toEqual(["booking.accepted", "booking.enroute"]);
    const rows = await client`select type from platform.outbox where aggregate_id = ${b.id} order by id`;
    expect(rows.map((r) => r.type)).toEqual(["booking.accepted", "booking.enroute"]);
  });

  it("only one provider wins a concurrent dispatch claim", async () => {
    const customer = randomUUID();
    const b = await svc.create(customer, { mode: "dispatch", totalCentimes: 5000, paymentMethod: "cash" });
    const providers = Array.from({ length: 6 }, () => randomUUID());
    const results = await Promise.allSettled(providers.map((p) => svc.command(b.id, "accept", p)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [{ n }] = await client`select count(*)::int n from booking.booking_event where booking_id = ${b.id}`;
    expect(n).toBe(1);
    const [{ o }] = await client`select count(*)::int o from platform.outbox where aggregate_id = ${b.id}`;
    expect(o).toBe(1);
  });

  it("outbox relay publishes each event exactly once per row and marks it", async () => {
    const customer = randomUUID(), provider = randomUUID();
    const b = await svc.create(customer, { mode: "catalogue", providerId: provider, totalCentimes: 100, paymentMethod: "cash" });
    await svc.command(b.id, "accept", provider);
    const seen: string[] = [];
    // drain everything pending (other tests may have rows too)
    while ((await relayOutbox(db, { publish: async (type, id) => { seen.push(`${type}:${id}`); } })) > 0);
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(await relayOutbox(db, { publish: async () => { throw new Error("should be empty"); } })).toBe(0);
    const [{ n }] = await client`select count(*)::int n from platform.outbox where aggregate_id = ${b.id} and published_at is not null`;
    expect(n).toBe(1);
  });
});
