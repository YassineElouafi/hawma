import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { allowedCommands, IllegalTransition, transition, type Actor, type BookingEvent, type BookingState, type Command, type Mode } from "../../domain/booking";
import { platformFee } from "../../domain/money";
import { localToUtc, slotAbs } from "../../domain/time";

export interface BookingRecord {
  id: string; customerId: string; providerId: string | null; mode: Mode; state: BookingState; totalCentimes: number; feeCentimes: number;
  paymentMethod: "cash" | "card" | "wallet"; version: number; events: BookingEvent[];
  lat?: number; lng?: number; categoryId?: string | null; createdAt?: string;
  offerId?: string | null; scheduledAt?: string | null; durationMin?: number; localDate?: string | null; startMin?: number | null; slotFrom?: number | null; slotTo?: number | null;
}
export interface BookingStats { total: number; byState: Record<string, number>; gmvCentimes: number; feesCentimes: number; perDay: { date: string; count: number; gmvCentimes: number }[] }
export interface BookingRepo { stats(days: number): Promise<BookingStats>; listAll(state: string | undefined, limit: number): Promise<BookingRecord[]>; listFor(userId: string, limit: number): Promise<BookingRecord[]>; get(id: string): Promise<BookingRecord | undefined>; save(b: BookingRecord, expectedVersion: number): Promise<void>; insert(b: BookingRecord): Promise<void> }

/** Test/dev repo. Production uses Drizzle with optimistic locking on booking.version + outbox write in the same tx. */
export class MemoryBookingRepo implements BookingRepo {
  private m = new Map<string, BookingRecord>();
  async get(id: string) { const b = this.m.get(id); return b && structuredClone(b); }
  async stats(days: number): Promise<BookingStats> {
    const all = [...this.m.values()]; const byState: Record<string, number> = {};
    for (const x of all) byState[x.state] = (byState[x.state] ?? 0) + 1;
    const done = all.filter((x) => ["Confirmed", "Settled", "Completed"].includes(x.state));
    const today = new Date();
    const perDay = Array.from({ length: days }, (_, i) => ({ date: new Date(today.getTime() - (days - 1 - i) * 864e5).toISOString().slice(0, 10), count: 0, gmvCentimes: 0 }));
    perDay[perDay.length - 1].count = all.length; perDay[perDay.length - 1].gmvCentimes = done.reduce((s, x) => s + x.totalCentimes, 0); // memory repo has no timestamps: attribute to today
    return { total: all.length, byState, gmvCentimes: done.reduce((s, x) => s + x.totalCentimes, 0), feesCentimes: done.reduce((s, x) => s + x.feeCentimes, 0), perDay };
  }
  async listAll(state: string | undefined, limit: number) { return [...this.m.values()].filter((b) => !state || b.state === state).slice(-limit).reverse().map((b) => structuredClone(b)); }
  async listFor(userId: string, limit: number) { return [...this.m.values()].filter((b) => b.customerId === userId || b.providerId === userId).slice(-limit).reverse().map((b) => structuredClone(b)); }
  async insert(b: BookingRecord) {
    if (b.providerId && b.slotFrom != null && b.slotTo != null && [...this.m.values()].some((x) => x.providerId === b.providerId && x.slotFrom != null && x.slotTo != null && !["Declined", "Expired", "Cancelled", "Refunded"].includes(x.state) && b.slotFrom! < x.slotTo! && x.slotFrom! < b.slotTo!)) throw new ConflictException("that time slot is no longer available");
    this.m.set(b.id, structuredClone(b));
  }
  async save(b: BookingRecord, expected: number) {
    const cur = this.m.get(b.id);
    if (!cur || cur.version !== expected) throw new ConflictException("booking was modified concurrently");
    this.m.set(b.id, structuredClone(b));
  }
}

@Injectable()
export class BookingsService {
  readonly published: BookingEvent[] = []; // stand-in for the transactional outbox
  onConfirmed?: (providerId: string | null) => Promise<void>;
  /** Dev/memory mode only: the Postgres store delivers events through the outbox relay instead. */
  afterEvent?: (b: BookingRecord, e: BookingEvent) => void;
  constructor(readonly repo: BookingRepo, private now: () => number = Date.now) {}

  async create(customerId: string, input: { mode: Mode; providerId?: string; totalCentimes: number; paymentMethod: BookingRecord["paymentMethod"]; lat?: number; lng?: number; categoryId?: string; offerId?: string; slot?: { date: string; startMin: number }; durationMin?: number }) {
    if (input.mode === "catalogue" && !input.providerId) throw new UnprocessableEntityException("catalogue bookings need a providerId");
    const b: BookingRecord = {
      id: randomUUID(), customerId, providerId: input.providerId ?? null, mode: input.mode, state: "Requested",
      totalCentimes: input.totalCentimes, feeCentimes: platformFee(input.totalCentimes), paymentMethod: input.paymentMethod, version: 0, events: [],
      lat: input.lat, lng: input.lng, categoryId: input.categoryId ?? null, createdAt: new Date(this.now()).toISOString(), offerId: input.offerId ?? null,
    };
    if (input.slot) {
      if (!input.durationMin) throw new UnprocessableEntityException("a duration is required to book a time slot");
      Object.assign(b, { durationMin: input.durationMin, localDate: input.slot.date, startMin: input.slot.startMin, scheduledAt: localToUtc(input.slot.date, input.slot.startMin).toISOString(), slotFrom: slotAbs(input.slot.date, input.slot.startMin), slotTo: slotAbs(input.slot.date, input.slot.startMin) + input.durationMin });
    }
    await this.repo.insert(b);
    return b;
  }

  private actorFor(b: BookingRecord, userId: string, staff: boolean): Actor {
    if (staff) return "ops";
    if (b.customerId === userId) return "customer";
    if (b.providerId === userId) return "provider";
    throw new ForbiddenException("not a participant of this booking");
  }

  async command(id: string, command: Command, userId: string, opts: { staff?: boolean } = {}) {
    const b = await this.repo.get(id);
    if (!b) throw new NotFoundException();
    // In dispatch mode any eligible provider may claim an unassigned booking (not the customer themself).
    const claim = !b.providerId && command === "accept" && b.mode === "dispatch" && b.customerId !== userId && !opts.staff;
    const actor: Actor = claim ? "provider" : this.actorFor(b, userId, !!opts.staff);
    try {
      const { state, event } = transition(b, command, actor);
      const expected = b.version;
      b.state = state; b.events.push(event); b.version++;
      if (command === "accept" && !b.providerId) b.providerId = userId;
      await this.repo.save(b, expected);
      this.published.push(event); this.afterEvent?.(b, event);
      if (command === "confirm" && this.onConfirmed) await this.onConfirmed(b.providerId).catch(() => {});
      return { ...b, allowed: allowedCommands(b, actor) };
    } catch (e) {
      if (e instanceof IllegalTransition) throw new UnprocessableEntityException(e.message);
      throw e;
    }
  }

  stats(days = 14) { return this.repo.stats(days); }
  async listAll(state: string | undefined, limit = 100) { return this.repo.listAll(state, limit); }
  async getAny(id: string) { const b = await this.repo.get(id); if (!b) throw new NotFoundException(); return b; }
  /** System-initiated transition (dispatch expiry etc.): no participant check. */
  async systemCommand(id: string, command: Command) {
    const b = await this.repo.get(id); if (!b) throw new NotFoundException();
    const { state, event } = transition(b, command, "system"); const expected = b.version;
    b.state = state; b.events.push(event); b.version++; await this.repo.save(b, expected); this.published.push(event); return b;
  }
  async list(userId: string, limit = 50) { return this.repo.listFor(userId, limit); }

  async get(id: string, userId: string) {
    const b = await this.repo.get(id);
    if (!b) throw new NotFoundException();
    const actor = this.actorFor(b, userId, false);
    return { ...b, allowed: allowedCommands(b, actor) };
  }
}

/** Realtime authorisation helpers (used by the gateway). */
export async function bookingAccess(repo: BookingRepo, bookingId: string, userId: string) {
  const b = await repo.get(bookingId);
  if (!b) return { participant: false, canShareLocation: false };
  const participant = b.customerId === userId || b.providerId === userId;
  const canShareLocation = b.providerId === userId && ["Accepted", "EnRoute", "Arrived", "InProgress"].includes(b.state);
  return { participant, canShareLocation };
}
