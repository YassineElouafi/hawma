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

(url ? describe : describe.skip)("outbox → realtime delivery (real Postgres)", () => {
  it("a booking transition reaches both parties' channels through the relay exactly once", async () => {
    const client = postgres(url!, { max: 3 }); const db2 = drizzle(client);
    const { MemoryBus } = await import("../src/realtime/bus"); const { BusPublisher } = await import("../src/realtime/outbox-publisher");
    const repo = new PgBookingRepo(db2); const svc = new BookingsService(repo); const bus = new MemoryBus();
    const cust = randomUUID(), prov = randomUUID(); const got: { ch: string; type: string }[] = [];
    for (const ch of [`user:${cust}`, `user:${prov}`]) await bus.subscribe(ch, (m) => got.push({ ch, type: (m as { type: string }).type }));
    const b = await svc.create(cust, { mode: "catalogue", providerId: prov, totalCentimes: 1000, paymentMethod: "cash" });
    await svc.command(b.id, "accept", prov);
    const pub = new BusPublisher(bus, async () => [cust, prov]);
    while ((await relayOutbox(db2, pub)) > 0);
    expect(got.filter((g) => g.type === "booking.accepted").map((g) => g.ch).sort()).toEqual([`user:${cust}`, `user:${prov}`].sort());
    await relayOutbox(db2, pub); expect(got.filter((g) => g.type === "booking.accepted")).toHaveLength(2);   // not re-delivered
    await client.end();
  });
});

(url ? describe : describe.skip)("ledger settlement on real Postgres", () => {
  it("confirmed cash job posts a balanced transaction exactly once, even under concurrent/replayed delivery", async () => {
    const { LedgerService } = await import("../src/modules/ledger/ledger.service"); const { PgLedgerRepo } = await import("../src/modules/ledger/pg-ledger.repo");
    const client = postgres(url!, { max: 8 }); const db2 = drizzle(client); const repo = new PgBookingRepo(db2); const svc = new BookingsService(repo); const ledger = new LedgerService(new PgLedgerRepo(db2), repo);
    const cust = randomUUID(), prov = randomUUID();
    const b = await svc.create(cust, { mode: "catalogue", providerId: prov, totalCentimes: 20000, paymentMethod: "cash" });
    for (const c of ["accept", "start_trip", "arrive", "start_job", "complete"] as const) await svc.command(b.id, c, prov);
    await svc.command(b.id, "confirm", cust);
    const results = await Promise.all(Array.from({ length: 6 }, () => ledger.settleBooking(b.id)));
    expect(results.filter((r) => r === "posted")).toHaveLength(1); expect(results.filter((r) => r === "duplicate")).toHaveLength(5);
    const rows = await client`select account, amount_centimes from money.ledger_entry where owner_id = ${prov} or (account = 'platform_revenue' and txn_id = (select txn_id from money.ledger_entry where owner_id = ${prov} limit 1))`;
    expect(rows.reduce((s, r) => s + r.amount_centimes, 0)).toBe(0);
    expect(await ledger.providerMoney(prov)).toMatchObject({ netEarningsCentimes: 17000, cashOwedCentimes: 3000 });
    expect((await ledger.cashOwedFor([prov, randomUUID()])).get(prov)).toBe(3000);
    await client.end();
  });
});

(url ? describe : describe.skip)("cash settlement on real Postgres", () => {
  it("settlement is concurrency-safe and idempotent; debtors reflect it", async () => {
    const { LedgerService } = await import("../src/modules/ledger/ledger.service"); const { PgLedgerRepo } = await import("../src/modules/ledger/pg-ledger.repo");
    const client = postgres(url!, { max: 8 }); const db2 = drizzle(client); const repo = new PgBookingRepo(db2); const svc = new BookingsService(repo); const ledger = new LedgerService(new PgLedgerRepo(db2), repo);
    const cust = randomUUID(), prov = randomUUID();
    const b = await svc.create(cust, { mode: "catalogue", providerId: prov, totalCentimes: 20000, paymentMethod: "cash" });
    for (const c of ["accept", "start_trip", "arrive", "start_job", "complete"] as const) await svc.command(b.id, c, prov);
    await svc.command(b.id, "confirm", cust); await ledger.settleBooking(b.id);
    const ref = randomUUID(); const rs = await Promise.all(Array.from({ length: 5 }, () => ledger.settleCash(prov, 1000, ref)));
    expect(rs.filter((r) => r.posted)).toHaveLength(1);
    expect((await ledger.cashOwedFor([prov])).get(prov)).toBe(2000);
    expect((await ledger.debtors(500)).find((d) => d.providerId === prov)?.owedCentimes).toBe(2000);
    await ledger.settleCash(prov, 2000, randomUUID()); expect((await ledger.debtors(500)).some((d) => d.providerId === prov)).toBe(false);
    await client.end();
  });
});

(url ? describe : describe.skip)("disputes on real Postgres", () => {
  it("one dispute per booking, atomic resolution, ledger posted once", async () => {
    const { LedgerService } = await import("../src/modules/ledger/ledger.service"); const { PgLedgerRepo } = await import("../src/modules/ledger/pg-ledger.repo");
    const { DisputesService } = await import("../src/modules/disputes/disputes.service"); const { PgDisputeRepo } = await import("../src/modules/disputes/pg-disputes.repo");
    const client = postgres(url!, { max: 8 }); const db2 = drizzle(client); const repo = new PgBookingRepo(db2); const bookings = new BookingsService(repo); const ledger = new LedgerService(new PgLedgerRepo(db2), repo); const disputes = new DisputesService(new PgDisputeRepo(db2), bookings, ledger);
    const cust = randomUUID(), prov = randomUUID(), staff = randomUUID();
    const b = await bookings.create(cust, { mode: "catalogue", providerId: prov, totalCentimes: 10000, paymentMethod: "cash" });
    for (const c of ["accept", "start_trip", "arrive", "start_job", "complete"] as const) await bookings.command(b.id, c, prov);
    const opens = await Promise.allSettled([disputes.open(cust, b.id, "Le prestataire n'a pas fini le travail"), disputes.open(cust, b.id, "Le prestataire n'a pas fini le travail")]);
    expect(opens.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const d = (await disputes.forBooking(b.id))!;
    const res = await Promise.allSettled([disputes.resolve(staff, d.id, "refund_partial", "half the job", 4000), disputes.resolve(randomUUID(), d.id, "refund_full", "conflicting decision")]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const final = await disputes.forBooking(b.id); expect(final?.status).toBe("resolved");
    const m = await ledger.providerMoney(prov);
    expect(m.netEarningsCentimes === 5100 || (m.netEarningsCentimes === 0 && final?.outcome === "refund_full")).toBe(true);      // whichever won, exactly one outcome was posted
    expect([6000 * 0.15 + 4000, 10000]).toContain(m.cashOwedCentimes);
    await client.end();
  });
});

(url ? describe : describe.skip)("slot bookings on real Postgres (exclusion constraint)", () => {
  it("parallel bookings of one slot: exactly one wins; overlaps rejected; cancelling frees the slot", async () => {
    const client = postgres(url!, { max: 10 }); const db2 = drizzle(client); const svc = new BookingsService(new PgBookingRepo(db2));
    const prov = randomUUID(); const mk = (date: string, startMin: number, dur: number, cust = randomUUID()) => svc.create(cust, { mode: "catalogue", providerId: prov, totalCentimes: 5000, paymentMethod: "cash", slot: { date, startMin }, durationMin: dur });
    const rs = await Promise.allSettled(Array.from({ length: 6 }, () => mk("2027-03-02", 600, 60)));
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((rs.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.message).toMatch(/no longer available/);
    await expect(mk("2027-03-02", 630, 60)).rejects.toThrow(/no longer available/);          // 10:30–11:30 overlaps 10:00–11:00
    await expect(mk("2027-03-02", 570, 60)).rejects.toThrow(/no longer available/);          // 09:30–10:30 overlaps
    await mk("2027-03-02", 660, 60); await mk("2027-03-02", 540, 60);                         // adjacent slots are fine
    const won = (rs.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ id: string; customerId: string }>).value;
    await svc.command(won.id, "cancel", won.customerId);
    await mk("2027-03-02", 600, 60);                                                          // freed
    const [row] = await client`select scheduled_at, local_date, start_min, slot_from, slot_to from booking.booking where id = ${won.id}`;
    expect(row.local_date).toBe("2027-03-02"); expect(row.slot_to - row.slot_from).toBe(60); expect(new Date(row.scheduled_at).toISOString()).toBe("2027-03-02T10:00:00.000Z");   // Ramadan 2027 (8 Feb – 9 Mar) is UTC+0
    await client.end();
  });
});
