import { desc, eq, sql } from "drizzle-orm";
import { ConflictException } from "@nestjs/common";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "../../db/schema";
import type { ProviderStatsSink, Review, ReviewRepo } from "./reviews.service";

const toR = (r: typeof s.reviews.$inferSelect): Review => ({ id: r.id, bookingId: r.bookingId, authorId: r.authorId, subjectId: r.subjectId, rating: r.rating, comment: r.comment ?? undefined, createdAt: r.createdAt.toISOString() });

export class PgReviewRepo implements ReviewRepo {
  constructor(private db: PostgresJsDatabase) {}
  async create(r: Omit<Review, "id" | "createdAt">) {
    try { const [row] = await this.db.insert(s.reviews).values({ bookingId: r.bookingId, authorId: r.authorId, subjectId: r.subjectId, rating: r.rating, comment: r.comment }).returning(); return toR(row); }
    catch (e) { const code = (e as { code?: string; cause?: { code?: string } }); if (code.code === "23505" || code.cause?.code === "23505") throw new ConflictException("you already reviewed this booking"); throw e; }
  }
  async forSubject(id: string, limit: number) { return (await this.db.select().from(s.reviews).where(eq(s.reviews.subjectId, id)).orderBy(desc(s.reviews.createdAt)).limit(limit)).map(toR); }
  async forBooking(id: string) { return (await this.db.select().from(s.reviews).where(eq(s.reviews.bookingId, id))).map(toR); }
}

/** Recomputes rating and job count from source rows (idempotent; no drift from incremental updates). */
export class PgStatsSink implements ProviderStatsSink {
  constructor(private db: PostgresJsDatabase) {}
  async refresh(providerId: string) {
    await this.db.execute(sql`
      update identity.provider_profile p set
        rating_avg = coalesce((select round(avg(rating)::numeric, 2) from booking.review where subject_id = p.user_id), 0),
        jobs_completed = (select count(*) from booking.booking where provider_id = p.user_id and state in ('Confirmed','Settled'))
      where p.user_id = ${providerId}`);
  }
}
