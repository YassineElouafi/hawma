import { and, desc, eq, or } from "drizzle-orm";
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
      paymentMethod: row.paymentMethod as BookingRecord["paymentMethod"], version: row.version, events,
    };
  }

  async insert(b: BookingRecord) {
    await this.db.insert(s.bookings).values({
      id: b.id, customerId: b.customerId, providerId: b.providerId, mode: b.mode, state: b.state,
      totalCentimes: b.totalCentimes, feeCentimes: b.feeCentimes, paymentMethod: b.paymentMethod, version: b.version,
      lat: 0, lng: 0,
    });
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
