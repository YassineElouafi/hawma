import { and, desc, eq, or, sql } from "drizzle-orm";
import { ConflictException } from "@nestjs/common";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "../../db/schema";
import type { BookingRecord, BookingRepo } from "./bookings.service";
import type { BookingEvent } from "../../domain/booking";

/**
 * Postgres repository. `save` is optimistic (WHERE version = expected) and appends booking_event rows plus
 * outbox rows in the SAME transaction, so a state change can never be persisted without its domain event.
 */
export class PgBookingRepo implements BookingRepo {
  constructor(private db: PostgresJsDatabase) {}

  private toRecord(row: typeof s.bookings.$inferSelect, events: BookingEvent[]): BookingRecord {
    return {
      id: row.id, customerId: row.customerId, providerId: row.providerId, mode: row.mode as BookingRecord["mode"],
      state: row.state as BookingRecord["state"], totalCentimes: row.totalCentimes, feeCentimes: row.feeCentimes,
      paymentMethod: row.paymentMethod as BookingRecord["paymentMethod"], version: row.version, events, lat: row.lat, lng: row.lng, categoryId: row.categoryId, createdAt: row.createdAt.toISOString(), offerId: row.offerId, scheduledAt: row.scheduledAt?.toISOString() ?? null, durationMin: row.durationMin, localDate: row.localDate, startMin: row.startMin, slotFrom: row.slotFrom, slotTo: row.slotTo,
    };
  }

  async insert(b: BookingRecord) {
    try {
      await this.db.insert(s.bookings).values({
      id: b.id, customerId: b.customerId, providerId: b.providerId, mode: b.mode, state: b.state,
      totalCentimes: b.totalCentimes, feeCentimes: b.feeCentimes, paymentMethod: b.paymentMethod, version: b.version,
      lat: b.lat ?? 0, lng: b.lng ?? 0, categoryId: b.categoryId ?? null,
        offerId: b.offerId ?? null, scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : null, durationMin: b.durationMin ?? 60, localDate: b.localDate ?? null, startMin: b.startMin ?? null, slotFrom: b.slotFrom ?? null, slotTo: b.slotTo ?? null,
      });
    } catch (e) { const c = e as { code?: string; cause?: { code?: string } }; const code = c.code ?? c.cause?.code; if (code === "23P01" || code === "40P01") throw new ConflictException("that time slot is no longer available"); throw e; }   // exclusion_violation, or deadlock_detected when two overlapping inserts race (one of them must lose)
  }

  async stats(days: number) {
    const rows = await this.db.execute<{ state: string; n: number; gmv: string; fee: string }>(sql`select state, count(*)::int n, coalesce(sum(total_centimes),0)::bigint gmv, coalesce(sum(fee_centimes),0)::bigint fee from booking.booking group by state`);
    const byState: Record<string, number> = {}; let total = 0, gmv = 0, fees = 0;
    for (const r of rows) { byState[r.state] = Number(r.n); total += Number(r.n); if (["Confirmed", "Settled", "Completed"].includes(r.state)) { gmv += Number(r.gmv); fees += Number(r.fee); } }
    const dayRows = await this.db.execute<{ d: string; n: number; gmv: string }>(sql`
      select to_char(g.d, 'YYYY-MM-DD') d, count(b.id)::int n,
             coalesce(sum(b.total_centimes) filter (where b.state in ('Confirmed','Settled','Completed')), 0)::bigint gmv
      from generate_series(current_date - (${days - 1}::int), current_date, interval '1 day') g(d)
      left join booking.booking b on b.created_at::date = g.d::date
      group by g.d order by g.d`);
    return { total, byState, gmvCentimes: gmv, feesCentimes: fees, perDay: [...dayRows].map((r) => ({ date: r.d, count: Number(r.n), gmvCentimes: Number(r.gmv) })) };
  }

  async listAll(state: string | undefined, limit: number) {
    const rows = await this.db.select().from(s.bookings).where(state ? eq(s.bookings.state, state) : undefined).orderBy(desc(s.bookings.createdAt)).limit(limit);
    return rows.map((r) => this.toRecord(r, []));
  }

  async listFor(userId: string, limit: number) {
    const rows = await this.db.select().from(s.bookings).where(or(eq(s.bookings.customerId, userId), eq(s.bookings.providerId, userId))).orderBy(desc(s.bookings.createdAt)).limit(limit);
    return rows.map((r) => this.toRecord(r, []));
  }

  async get(id: string) {
    const [row] = await this.db.select().from(s.bookings).where(eq(s.bookings.id, id));
    if (!row) return undefined;
    const evs = await this.db.select().from(s.bookingEvents).where(eq(s.bookingEvents.bookingId, id)).orderBy(s.bookingEvents.createdAt, s.bookingEvents.id);
    return this.toRecord(row, evs.map((e) => ({ type: e.type as BookingEvent["type"], from: e.fromState as BookingEvent["from"], to: e.toState as BookingEvent["to"], command: (e.payload as { command: BookingEvent["command"] }).command, actor: e.actor as BookingEvent["actor"], at: e.createdAt.toISOString() })));
  }

  async save(b: BookingRecord, expectedVersion: number) {
    await this.db.transaction(async (tx) => {
      const upd = await tx.update(s.bookings)
        .set({ state: b.state, providerId: b.providerId, version: b.version, updatedAt: new Date() })
        .where(and(eq(s.bookings.id, b.id), eq(s.bookings.version, expectedVersion)))
        .returning({ id: s.bookings.id });
      if (upd.length === 0) throw new ConflictException("booking was modified concurrently");
      const ev = b.events[b.events.length - 1];
      if (ev) {
        await tx.insert(s.bookingEvents).values({ bookingId: b.id, type: ev.type, fromState: ev.from, toState: ev.to, actor: ev.actor, payload: { command: ev.command } });
        await tx.insert(s.outbox).values({ type: ev.type, aggregateId: b.id, payload: { bookingId: b.id, ...ev } });
      }
    });
  }
}
