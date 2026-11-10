import { and, eq, lte } from "drizzle-orm";
import { ConflictException } from "@nestjs/common";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "../../db/schema";
import type { Offer, OfferRepo, ProviderPort } from "./dispatch.service";

const toO = (r: typeof s.dispatchOffers.$inferSelect): Offer => ({ id: r.id, bookingId: r.bookingId, providerId: r.providerId, status: r.status as Offer["status"], expiresAt: r.expiresAt.toISOString(), round: r.round });

export class PgOfferRepo implements OfferRepo {
  constructor(private db: PostgresJsDatabase) {}
  async create(o: Omit<Offer, "id">) {
    try { const [r] = await this.db.insert(s.dispatchOffers).values({ bookingId: o.bookingId, providerId: o.providerId, status: o.status, expiresAt: new Date(o.expiresAt), round: o.round }).returning(); return toO(r); }
    catch (e) { const c = e as { code?: string; cause?: { code?: string } }; if (c.code === "23505" || c.cause?.code === "23505") throw new ConflictException("an offer is already open for this booking"); throw e; }
  }
  async get(id: string) { const [r] = await this.db.select().from(s.dispatchOffers).where(eq(s.dispatchOffers.id, id)); return r && toO(r); }
  async transition(id: string, to: Offer["status"]) { const r = await this.db.update(s.dispatchOffers).set({ status: to }).where(and(eq(s.dispatchOffers.id, id), eq(s.dispatchOffers.status, "offered"))).returning({ id: s.dispatchOffers.id }); return r.length === 1; }
  async forBooking(b: string) { return (await this.db.select().from(s.dispatchOffers).where(eq(s.dispatchOffers.bookingId, b)).orderBy(s.dispatchOffers.createdAt)).map(toO); }
  async pendingFor(p: string) { return (await this.db.select().from(s.dispatchOffers).where(and(eq(s.dispatchOffers.providerId, p), eq(s.dispatchOffers.status, "offered")))).map(toO); }
  async expiredOpen(now: string) { return (await this.db.select().from(s.dispatchOffers).where(and(eq(s.dispatchOffers.status, "offered"), lte(s.dispatchOffers.expiresAt, new Date(now))))).map(toO); }
}

export class PgProviderPort implements ProviderPort {
  constructor(private db: PostgresJsDatabase) {}
  async profile(id: string) { const [r] = await this.db.select().from(s.providers).where(eq(s.providers.userId, id)); return r && { tier: r.kycTier, status: r.status, rating: r.ratingAvg, cancelRate: r.cancelRate, acceptance: r.acceptance }; }
  async busy(id: string) { const r = await this.db.select({ id: s.bookings.id }).from(s.bookings).where(and(eq(s.bookings.providerId, id))).limit(50); return (await Promise.all(r.map(async (x) => { const [b] = await this.db.select({ st: s.bookings.state }).from(s.bookings).where(eq(s.bookings.id, x.id)); return ["Accepted", "EnRoute", "Arrived", "InProgress"].includes(b.st); }))).some(Boolean); }
  async requiredTier(c: string | null | undefined) { if (!c) return 1; const [r] = await this.db.select({ t: s.categories.requiredTier }).from(s.categories).where(eq(s.categories.id, c)); return r?.t as number; }
}
