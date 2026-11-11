import { and, eq, inArray, lte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "../../db/schema";
import { OfferConflict, type Offer, type OfferRepo, type ProviderPort } from "./dispatch.service";

const toO = (r: typeof s.dispatchOffers.$inferSelect): Offer => ({ id: r.id, bookingId: r.bookingId, providerId: r.providerId, status: r.status as Offer["status"], expiresAt: r.expiresAt.toISOString(), round: r.round });

export class PgOfferRepo implements OfferRepo {
  constructor(private db: PostgresJsDatabase) {}
  async create(o: Omit<Offer, "id">) {
    try { const [r] = await this.db.insert(s.dispatchOffers).values({ bookingId: o.bookingId, providerId: o.providerId, status: o.status, expiresAt: new Date(o.expiresAt), round: o.round }).returning(); return toO(r); }
    catch (e) {
      const c = e as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } }; const code = c.code ?? c.cause?.code; const name = c.constraint_name ?? c.cause?.constraint_name ?? "";
      if (code === "23505") throw new OfferConflict(name.includes("provider") ? "provider" : "booking"); throw e;
    }
  }
  async get(id: string) { const [r] = await this.db.select().from(s.dispatchOffers).where(eq(s.dispatchOffers.id, id)); return r && toO(r); }
  async transition(id: string, to: Offer["status"]) { const r = await this.db.update(s.dispatchOffers).set({ status: to }).where(and(eq(s.dispatchOffers.id, id), eq(s.dispatchOffers.status, "offered"))).returning({ id: s.dispatchOffers.id }); return r.length === 1; }
  async forBooking(b: string) { return (await this.db.select().from(s.dispatchOffers).where(eq(s.dispatchOffers.bookingId, b)).orderBy(s.dispatchOffers.createdAt)).map(toO); }
  async openProviderIds(ids: string[]) { if (!ids.length) return new Set<string>(); return new Set((await this.db.select({ p: s.dispatchOffers.providerId }).from(s.dispatchOffers).where(and(eq(s.dispatchOffers.status, "offered"), inArray(s.dispatchOffers.providerId, ids)))).map((r) => r.p)); }
  async pendingFor(p: string) { return (await this.db.select().from(s.dispatchOffers).where(and(eq(s.dispatchOffers.providerId, p), eq(s.dispatchOffers.status, "offered")))).map(toO); }
  async expiredOpen(now: string) { return (await this.db.select().from(s.dispatchOffers).where(and(eq(s.dispatchOffers.status, "offered"), lte(s.dispatchOffers.expiresAt, new Date(now))))).map(toO); }
}

export class PgProviderPort implements ProviderPort {
  constructor(private db: PostgresJsDatabase, private ledger?: { cashOwedFor(ids: string[]): Promise<Map<string, number>> }) {}
  async cashOwed(ids: string[]) { return this.ledger ? this.ledger.cashOwedFor(ids) : new Map<string, number>(); }
  async profile(id: string) { const [r] = await this.db.select().from(s.providers).where(eq(s.providers.userId, id)); return r && { tier: r.kycTier, status: r.status, rating: r.ratingAvg, cancelRate: r.cancelRate, acceptance: r.acceptance }; }
  async profiles(ids: string[]) { const m = new Map<string, { tier: number; status: string; rating: number; cancelRate: number; acceptance: number }>(); if (!ids.length) return m; for (const r of await this.db.select().from(s.providers).where(inArray(s.providers.userId, ids))) m.set(r.userId, { tier: r.kycTier, status: r.status, rating: r.ratingAvg, cancelRate: r.cancelRate, acceptance: r.acceptance }); return m; }
  async busySet(ids: string[]) { if (!ids.length) return new Set<string>(); return new Set((await this.db.selectDistinct({ p: s.bookings.providerId }).from(s.bookings).where(and(inArray(s.bookings.providerId, ids), inArray(s.bookings.state, ["Accepted", "EnRoute", "Arrived", "InProgress"])))).map((r) => r.p as string)); }
  async busy(id: string) { return (await this.busySet([id])).has(id); }
  async requiredTier(c: string | null | undefined) { if (!c) return 1; const [r] = await this.db.select({ t: s.categories.requiredTier }).from(s.categories).where(eq(s.categories.id, c)); return r?.t as number; }
}
