import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "../src/db/schema";
import { DispatchService } from "../src/modules/dispatch/dispatch.service";
import { PgOfferRepo, PgProviderPort } from "../src/modules/dispatch/pg-dispatch.repo";
import { MemoryPresence } from "../src/modules/dispatch/presence";
import { MemoryBus } from "../src/realtime/bus";
import { BookingsService } from "../src/modules/bookings/bookings.service";
import { PgBookingRepo } from "../src/modules/bookings/pg-booking.repo";

const url = process.env.DATABASE_URL; const C = { lat: 33.5883, lng: -7.635 };
(url ? describe : describe.skip)("dispatch on real Postgres", () => {
  let client: ReturnType<typeof postgres>; let db: ReturnType<typeof drizzle>;
  beforeAll(() => { client = postgres(url!, { max: 6 }); db = drizzle(client); });
  afterAll(async () => { await client.end(); });
  const mkProvider = async (tier = 1) => { const [u] = await db.insert(s.users).values({ phone: `+2126${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}` }).returning(); await db.insert(s.providers).values({ userId: u.id, kycTier: tier, status: "active", ratingAvg: 4.5 }); return u.id; };

  it("persists location+category, offers once, enforces one open offer, and survives a claim race", async () => {
    const presence = new MemoryPresence(); const bookings = new BookingsService(new PgBookingRepo(db));
    const svc = new DispatchService(new PgOfferRepo(db), presence, new MemoryBus(), new PgProviderPort(db), bookings, () => Date.now());
    const ids = await Promise.all([mkProvider(), mkProvider(), mkProvider()]);
    ids.forEach((id, i) => presence.heartbeat(id, C.lat + i * 0.002, C.lng));
    const customer = crypto.randomUUID();
    const b = await svc.request(customer, { ...C, categoryId: "errands", totalCentimes: 4000, paymentMethod: "cash" });
    const [row] = await client`select lat, lng, category_id from booking.booking where id = ${b.id}`;
    expect(row).toMatchObject({ lat: C.lat, lng: C.lng, category_id: "errands" });
    await Promise.all([svc.matchNext(b.id), svc.matchNext(b.id), svc.matchNext(b.id)]);       // parallel matchers
    const [{ n }] = await client`select count(*)::int n from booking.dispatch_offer where booking_id = ${b.id} and status = 'offered'`; expect(n).toBe(1);
    const offered = (await client`select id, provider_id from booking.dispatch_offer where booking_id = ${b.id} and status = 'offered'`)[0];
    const res = await Promise.allSettled([svc.accept(offered.provider_id, offered.id), svc.accept(offered.provider_id, offered.id)]); // double-tap
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await bookings.getAny(b.id)).providerId).toBe(offered.provider_id);
  });

  it("tier-gated categories skip under-qualified providers; unfilled requests expire", async () => {
    const presence = new MemoryPresence(); const bookings = new BookingsService(new PgBookingRepo(db));
    const svc = new DispatchService(new PgOfferRepo(db), presence, new MemoryBus(), new PgProviderPort(db), bookings, () => Date.now());
    const low = await mkProvider(1); await presence.heartbeat(low, C.lat, C.lng);
    const b = await svc.request(crypto.randomUUID(), { ...C, categoryId: "cleaning", totalCentimes: 9000, paymentMethod: "cash" }); // cleaning needs tier 2
    expect((await bookings.getAny(b.id)).state).toBe("Expired");
    expect(await svc.pending(low)).toHaveLength(0);
    await expect(svc.request(crypto.randomUUID(), { ...C, categoryId: "nope", totalCentimes: 1, paymentMethod: "cash" })).rejects.toThrow(/unknown category/);
  });
});

(url ? describe : describe.skip)("dispatch under concurrency on real Postgres", () => {
  it("30 simultaneous requests, 10 providers: no provider ever holds two open offers or two jobs", async () => {
    const client = postgres(url!, { max: 12 }); const db = drizzle(client);
    const presence = new MemoryPresence(); const bookings = new BookingsService(new PgBookingRepo(db));
    const svc = new DispatchService(new PgOfferRepo(db), presence, new MemoryBus(), new PgProviderPort(db), bookings, () => Date.now());
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) { const [u] = await db.insert(s.users).values({ phone: `+2126${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}` }).returning(); await db.insert(s.providers).values({ userId: u.id, kycTier: 1, status: "active", ratingAvg: 4.5 }); ids.push(u.id); await presence.heartbeat(u.id, C.lat + i * 0.0005, C.lng); }
    const reqs = await Promise.all(Array.from({ length: 30 }, () => svc.request(crypto.randomUUID(), { lat: C.lat, lng: C.lng, categoryId: "errands", totalCentimes: 2500, paymentMethod: "cash" })));
    const open = await client`select provider_id, count(*)::int n from booking.dispatch_offer where provider_id = any(${ids}) and status = 'offered' group by provider_id`;
    expect(Math.max(0, ...open.map((r) => r.n))).toBeLessThanOrEqual(1);
    for (let round = 0; round < 4; round++) await Promise.all(ids.map(async (id) => { for (const o of await svc.pending(id)) await svc.accept(id, o.id).catch(() => {}); }));
    const jobs = await client`select provider_id, count(*)::int n from booking.booking where id = any(${reqs.map((r) => r.id)}) and provider_id is not null group by provider_id`;
    expect(Math.max(0, ...jobs.map((r) => r.n))).toBeLessThanOrEqual(1);
    const states = await client`select state, count(*)::int n from booking.booking where id = any(${reqs.map((r) => r.id)}) group by state`;
    expect(states.reduce((a, r) => a + r.n, 0)).toBe(30);
    await client.end();
  });
});
