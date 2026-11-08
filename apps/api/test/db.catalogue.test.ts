import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { randomUUID } from "node:crypto";
import * as s from "../src/db/schema";
import { PgCatalogueRepo } from "../src/modules/catalogue/pg-catalogue.repo";
import { CatalogueService } from "../src/modules/catalogue/catalogue.service";

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;
const maarif = { lat: 33.5883, lng: -7.635 };

d("Postgres catalogue (real Postgres)", () => {
  let client: ReturnType<typeof postgres>; let db: ReturnType<typeof drizzle>; let svc: CatalogueService;
  beforeAll(() => { client = postgres(url!, { max: 3 }); db = drizzle(client); svc = new CatalogueService(new PgCatalogueRepo(db)); });
  afterAll(async () => { await client.end(); });

  async function provider(tier: number, status = "active") {
    const [u] = await db.insert(s.users).values({ phone: `+2126${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}` }).returning();
    await db.insert(s.providers).values({ userId: u.id, kycTier: tier, status, ratingAvg: 4.6, jobsCompleted: 20 });
    return u.id;
  }

  it("seeded categories exist with tiers", async () => {
    const rows = await client`select id, required_tier from catalogue.category order by id`;
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining(["cleaning", "tutoring", "errands"]));
    expect(rows.find((r) => r.id === "cleaning")!.required_tier).toBe(2);
  });

  it("enforces tier, publishes, and finds the offer by radius, category and text", async () => {
    const p1 = await provider(1), p2 = await provider(2);
    await expect(svc.publish(p1, { categoryId: "cleaning", title: "Ménage complet", lat: maarif.lat, lng: maarif.lng, radiusM: 5000, basePriceCentimes: 12000, pricingModel: "fixed", recurringAllowed: true })).rejects.toThrow(/tier 2/);
    const o = await svc.publish(p2, { categoryId: "cleaning", title: "Ménage complet", lat: maarif.lat + 0.004, lng: maarif.lng, radiusM: 5000, basePriceCentimes: 12000, pricingModel: "fixed", recurringAllowed: true });
    const near = await svc.search({ ...maarif, radiusM: 3000, categoryId: "cleaning", q: "ménage", limit: 10 }, "2026-11-10");
    expect(near.map((x) => x.id)).toContain(o.id);
    const far = await svc.search({ lat: maarif.lat + 0.3, lng: maarif.lng, radiusM: 3000, categoryId: "cleaning", limit: 10 }, "2026-11-10");
    expect(far.map((x) => x.id)).not.toContain(o.id);
  });

  it("slots subtract real bookings (Casablanca local time)", async () => {
    const p = await provider(2), customer = randomUUID();
    const o = await svc.publish(p, { categoryId: "tutoring", title: "Maths", lat: maarif.lat, lng: maarif.lng, radiusM: 5000, basePriceCentimes: 10000, pricingModel: "hourly", recurringAllowed: false });
    await svc.setAvailability(p, [{ weekday: 2, startMin: 540, endMin: 720 }]); // Tuesdays 09:00-12:00 local
    // booking Tue 2026-11-10 10:00 local (local fields computed by the app, see domain/time.ts) = 09:00Z, 60 min
    await client`insert into booking.booking (customer_id, provider_id, lat, lng, scheduled_at, duration_min, local_date, start_min, state) values (${customer}, ${p}, 33.5, -7.6, '2026-11-10T09:00:00Z', 60, '2026-11-10', 600, 'Accepted')`;
    // cancelled booking at 09:00 local must NOT block
    await client`insert into booking.booking (customer_id, provider_id, lat, lng, scheduled_at, duration_min, local_date, start_min, state) values (${customer}, ${p}, 33.5, -7.6, '2026-11-10T08:00:00Z', 60, '2026-11-10', 540, 'Cancelled')`;
    const slots = await svc.slots(o.id, "2026-11-10", 1, 60);
    expect(slots.map((x) => x.startMin)).toEqual([540, 660]); // 09:00 ok (cancelled ignored), 10:00 busy, 09:30/10:30 overlap, 11:00 ok
  });
});
