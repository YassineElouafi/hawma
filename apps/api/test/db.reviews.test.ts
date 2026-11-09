import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { randomUUID } from "node:crypto";
import * as s from "../src/db/schema";
import { PgReviewRepo, PgStatsSink } from "../src/modules/reviews/pg-reviews.repo";
import { ReviewsService } from "../src/modules/reviews/reviews.service";
import { BookingsService } from "../src/modules/bookings/bookings.service";
import { PgBookingRepo } from "../src/modules/bookings/pg-booking.repo";

const url = process.env.DATABASE_URL;
(url ? describe : describe.skip)("reviews on real Postgres", () => {
  let client: ReturnType<typeof postgres>; let db: ReturnType<typeof drizzle>;
  beforeAll(() => { client = postgres(url!, { max: 3 }); db = drizzle(client); });
  afterAll(async () => { await client.end(); });

  it("recomputes provider rating and job count from source rows; duplicates conflict", async () => {
    const repo = new PgBookingRepo(db), bookings = new BookingsService(repo);
    const svc = new ReviewsService(new PgReviewRepo(db), repo, new PgStatsSink(db), bookings);
    const [pu] = await db.insert(s.users).values({ phone: `+2126${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}` }).returning();
    await db.insert(s.providers).values({ userId: pu.id, kycTier: 1, status: "active" });
    const ratings = [5, 4, 3];
    for (const r of ratings) {
      const cust = randomUUID();
      const b = await bookings.create(cust, { mode: "catalogue", providerId: pu.id, totalCentimes: 1000, paymentMethod: "cash" });
      for (const c of ["accept", "start_trip", "arrive", "start_job", "complete"] as const) await bookings.command(b.id, c, pu.id);
      await bookings.command(b.id, "confirm", cust);
      await svc.rate(cust, b.id, r, "ok");
      await expect(svc.rate(cust, b.id, r)).rejects.toThrow(/already reviewed/);
    }
    const [p] = await client`select rating_avg, jobs_completed from identity.provider_profile where user_id = ${pu.id}`;
    expect(Number(p.rating_avg)).toBe(4); expect(p.jobs_completed).toBe(3);
    expect((await svc.forProvider(pu.id)).map((x) => x.rating).sort()).toEqual([3, 4, 5]);
  });
});
