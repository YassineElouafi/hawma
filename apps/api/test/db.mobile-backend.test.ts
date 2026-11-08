import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { randomUUID } from "node:crypto";
import { PgSessionRepo, PgUserRepo } from "../src/modules/auth/user.repo";
import { AuthService, ConsoleOtpSender, MemoryOtpStore } from "../src/modules/auth/auth.service";
import { seedDemo } from "../src/db/seed-demo";
import { PgBookingRepo } from "../src/modules/bookings/pg-booking.repo";
import { BookingsService } from "../src/modules/bookings/bookings.service";
import { PgCatalogueRepo } from "../src/modules/catalogue/pg-catalogue.repo";
import { CatalogueService } from "../src/modules/catalogue/catalogue.service";

const url = process.env.DATABASE_URL;
(url ? describe : describe.skip)("mobile backend on real Postgres", () => {
  let client: ReturnType<typeof postgres>; let db: ReturnType<typeof drizzle>;
  beforeAll(() => { client = postgres(url!, { max: 4 }); db = drizzle(client); });
  afterAll(async () => { await client.end(); });

  it("users persist across 'restarts' and refresh tokens rotate once", async () => {
    const sender = new ConsoleOtpSender();
    const mk = () => new AuthService(new MemoryOtpStore(), sender, new PgUserRepo(db), new PgSessionRepo(db));
    const a = mk(); await a.requestOtp("0633445566");
    const first = await a.verifyOtp("0633445566", sender.last.get("+212633445566")!);
    const b = mk(); await b.requestOtp("0633445566");                              // a "new process"
    const again = await b.verifyOtp("0633445566", sender.last.get("+212633445566")!);
    expect(again.userId).toBe(first.userId);                                       // same user row
    const rotated = await b.refresh(first.refreshToken);
    expect(rotated.userId).toBe(first.userId);
    await expect(b.refresh(first.refreshToken)).rejects.toThrow(/invalid refresh/);  // replay
    expect((await b.users.byId(first.userId))!.phone).toBe("+212633445566");
  });

  it("seedDemo is idempotent and makes offers searchable", async () => {
    await seedDemo(db); const again = await seedDemo(db);
    expect(again.created).toBe(0);
    const svc = new CatalogueService(new PgCatalogueRepo(db));
    const r = await svc.search({ lat: 33.5883, lng: -7.635, radiusM: 5000, q: "ménage", limit: 5 }, "2026-11-10");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].title).toMatch(/Ménage/);
  });

  it("lists my bookings (as customer or provider), newest first", async () => {
    const svc = new BookingsService(new PgBookingRepo(db)); const me = randomUUID(), other = randomUUID();
    const one = await svc.create(me, { mode: "catalogue", providerId: other, totalCentimes: 1000, paymentMethod: "cash" });
    const two = await svc.create(other, { mode: "catalogue", providerId: me, totalCentimes: 2000, paymentMethod: "cash" });
    const mine = await svc.list(me);
    expect(mine.map((b) => b.id)).toEqual([two.id, one.id]);
    expect((await svc.list(randomUUID())).length).toBe(0);
  });
});

(url ? describe : describe.skip)("booking stats on real Postgres", () => {
  it("aggregates by state and returns a gap-free 14-day series", async () => {
    const c = postgres(url!, { max: 2 }); const svc = new BookingsService(new PgBookingRepo(drizzle(c)));
    const cust = randomUUID(), prov = randomUUID();
    const b = await svc.create(cust, { mode: "catalogue", providerId: prov, totalCentimes: 5000, paymentMethod: "cash" });
    await svc.command(b.id, "accept", prov);
    const s = await svc.stats(14);
    expect(s.perDay).toHaveLength(14);
    expect(new Set(s.perDay.map((d) => d.date)).size).toBe(14);
    expect(s.byState.Accepted).toBeGreaterThanOrEqual(1);
    expect(s.total).toBe(Object.values(s.byState).reduce((a, n) => a + n, 0));
    expect(s.perDay[13].count).toBeGreaterThanOrEqual(2);
    await c.end();
  });
});
