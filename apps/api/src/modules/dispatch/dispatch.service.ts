import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { rank, nextRadius, type Candidate } from "../../domain/dispatch";
import type { BookingsService } from "../bookings/bookings.service";
import type { Bus } from "../../realtime/bus";
import type { PresenceStore } from "./presence";

export const OFFER_TTL_MS = 20_000;
export const START_RADIUS_M = 3000;

export interface Offer { id: string; bookingId: string; providerId: string; status: "offered" | "accepted" | "rejected" | "expired"; expiresAt: string; round: number }
export interface OfferRepo {
  create(o: Omit<Offer, "id">): Promise<Offer>;
  get(id: string): Promise<Offer | undefined>;
  /** Atomically moves offered→status; returns false if it was not 'offered' any more. */
  transition(id: string, to: Offer["status"]): Promise<boolean>;
  forBooking(bookingId: string): Promise<Offer[]>;
  pendingFor(providerId: string): Promise<Offer[]>;
  expiredOpen(nowIso: string): Promise<Offer[]>;
}
export class MemoryOfferRepo implements OfferRepo {
  items = new Map<string, Offer>();
  async create(o: Omit<Offer, "id">) { const v = { ...o, id: crypto.randomUUID() }; this.items.set(v.id, v); return { ...v }; }
  async get(id: string) { const v = this.items.get(id); return v && { ...v }; }
  async transition(id: string, to: Offer["status"]) { const v = this.items.get(id); if (!v || v.status !== "offered") return false; v.status = to; return true; }
  async forBooking(b: string) { return [...this.items.values()].filter((o) => o.bookingId === b).map((o) => ({ ...o })); }
  async pendingFor(p: string) { return [...this.items.values()].filter((o) => o.providerId === p && o.status === "offered").map((o) => ({ ...o })); }
  async expiredOpen(now: string) { return [...this.items.values()].filter((o) => o.status === "offered" && o.expiresAt <= now).map((o) => ({ ...o })); }
}

/** Facts about a provider needed to decide eligibility (read from the catalogue/identity read model). */
export interface ProviderPort { profile(id: string): Promise<{ tier: number; status: string; rating: number; cancelRate: number; acceptance: number } | undefined>; busy(id: string): Promise<boolean>; requiredTier(categoryId: string | null | undefined): Promise<number> }

@Injectable()
export class DispatchService {
  constructor(
    @Inject("OFFER_REPO") private offers: OfferRepo, @Inject("PRESENCE") private presence: PresenceStore, @Inject("BUS") private bus: Bus,
    @Inject("PROVIDER_PORT") private providers: ProviderPort, @Inject("BOOKINGS") private bookings: BookingsService, @Inject("CLOCK") private now: () => number = Date.now,
  ) {}

  /** Customer opens an on-demand request: creates a dispatch-mode booking and immediately starts matching. */
  async request(customerId: string, input: { lat: number; lng: number; categoryId: string; totalCentimes: number; paymentMethod: "cash" | "card" | "wallet" }) {
    const tier = await this.providers.requiredTier(input.categoryId);
    if (tier === undefined) throw new UnprocessableEntityException("unknown category");
    const booking = await this.bookings.create(customerId, { mode: "dispatch", ...input });
    await this.matchNext(booking.id);
    return booking;
  }

  /** Offers the job to the best remaining candidate; widens the radius when the pool is exhausted; expires the booking when nobody is left. */
  async matchNext(bookingId: string): Promise<Offer | null> {
    const b = await this.bookings.getAny(bookingId);
    if (b.state !== "Requested" || b.providerId) return null;
    const tried = await this.offers.forBooking(bookingId);
    const open = tried.find((o) => o.status === "offered"); if (open) return open; // never two open offers for one booking
    const triedIds = new Set(tried.map((o) => o.providerId));
    const requiredTier = (await this.providers.requiredTier(b.categoryId)) as 0 | 1 | 2 | 3;
    let radius = START_RADIUS_M, attempt = 0;
    for (;;) {
      const near = await this.presence.nearby(b.lat ?? 0, b.lng ?? 0, radius);
      const cands: Candidate[] = [];
      for (const n of near) {
        if (triedIds.has(n.id) || n.id === b.customerId) continue;
        const p = await this.providers.profile(n.id); if (!p || p.status !== "active") continue;
        cands.push({ id: n.id, distanceM: n.distanceM, etaS: n.distanceM / 6, rating: p.rating || 4, acceptance: p.acceptance, idleMinutes: 30, cancelRate: p.cancelRate, tier: Math.min(3, p.tier) as 0 | 1 | 2 | 3, busy: await this.providers.busy(n.id), blocked: false, cashOwed: 0 });
      }
      const best = rank(cands, { requiredTier, radiusM: radius, cashOwedLimit: 30_000 })[0];
      if (best) {
        let offer: Offer; try { offer = await this.offers.create({ bookingId, providerId: best.id, status: "offered", expiresAt: new Date(this.now() + OFFER_TTL_MS).toISOString(), round: tried.length }); } catch (e) { if (e instanceof ConflictException) return null; throw e; }
        await this.bus.publish(`user:${best.id}`, { type: "dispatch.offer", offerId: offer.id, bookingId, expiresAt: offer.expiresAt, totalCentimes: b.totalCentimes, categoryId: b.categoryId, distanceM: Math.round(best.distanceM) });
        return offer;
      }
      const next = nextRadius(radius, attempt++);
      if (next === null) break; radius = next;
    }
    await this.bookings.systemCommand(bookingId, "expire");
    await this.bus.publish(`user:${b.customerId}`, { type: "dispatch.unfilled", bookingId });
    return null;
  }

  async accept(providerId: string, offerId: string) {
    const o = await this.offers.get(offerId); if (!o) throw new NotFoundException();
    if (o.providerId !== providerId) throw new ForbiddenException();
    if (o.status !== "offered" || o.expiresAt <= new Date(this.now()).toISOString()) throw new ConflictException("offer is no longer available");
    if (!(await this.offers.transition(offerId, "accepted"))) throw new ConflictException("offer is no longer available");
    try { return await this.bookings.command(o.bookingId, "accept", providerId); }
    catch (e) { await this.matchNext(o.bookingId).catch(() => {}); throw e; } // lost a race / booking cancelled meanwhile
  }

  async reject(providerId: string, offerId: string) {
    const o = await this.offers.get(offerId); if (!o) throw new NotFoundException();
    if (o.providerId !== providerId) throw new ForbiddenException();
    if (!(await this.offers.transition(offerId, "rejected"))) throw new ConflictException("offer is no longer available");
    await this.matchNext(o.bookingId);
    return { ok: true };
  }

  pending(providerId: string) { return this.offers.pendingFor(providerId); }

  /** Run every few seconds: expire stale offers and move to the next candidate. */
  async tick() {
    let n = 0;
    for (const o of await this.offers.expiredOpen(new Date(this.now()).toISOString())) {
      if (await this.offers.transition(o.id, "expired")) { n++; await this.matchNext(o.bookingId).catch(() => {}); }
    }
    return n;
  }
}
