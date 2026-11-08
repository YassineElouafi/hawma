import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { allowedCommands, IllegalTransition, transition, type Actor, type BookingEvent, type BookingState, type Command, type Mode } from "../../domain/booking";
import { platformFee } from "../../domain/money";

export interface BookingRecord {
  id: string; customerId: string; providerId: string | null; mode: Mode; state: BookingState; totalCentimes: number; feeCentimes: number;
  paymentMethod: "cash" | "card" | "wallet"; version: number; events: BookingEvent[];
}
export interface BookingRepo { listAll(state: string | undefined, limit: number): Promise<BookingRecord[]>; listFor(userId: string, limit: number): Promise<BookingRecord[]>; get(id: string): Promise<BookingRecord | undefined>; save(b: BookingRecord, expectedVersion: number): Promise<void>; insert(b: BookingRecord): Promise<void> }

/** Test/dev repo. Production uses Drizzle with optimistic locking on booking.version + outbox write in the same tx. */
export class MemoryBookingRepo implements BookingRepo {
  private m = new Map<string, BookingRecord>();
  async get(id: string) { const b = this.m.get(id); return b && structuredClone(b); }
  async listAll(state: string | undefined, limit: number) { return [...this.m.values()].filter((b) => !state || b.state === state).slice(-limit).reverse().map((b) => structuredClone(b)); }
  async listFor(userId: string, limit: number) { return [...this.m.values()].filter((b) => b.customerId === userId || b.providerId === userId).slice(-limit).reverse().map((b) => structuredClone(b)); }
  async insert(b: BookingRecord) { this.m.set(b.id, structuredClone(b)); }
  async save(b: BookingRecord, expected: number) {
    const cur = this.m.get(b.id);
    if (!cur || cur.version !== expected) throw new ConflictException("booking was modified concurrently");
    this.m.set(b.id, structuredClone(b));
  }
}

@Injectable()
export class BookingsService {
  readonly published: BookingEvent[] = []; // stand-in for the transactional outbox
  constructor(readonly repo: BookingRepo) {}

  async create(customerId: string, input: { mode: Mode; providerId?: string; totalCentimes: number; paymentMethod: BookingRecord["paymentMethod"] }) {
    if (input.mode === "catalogue" && !input.providerId) throw new UnprocessableEntityException("catalogue bookings need a providerId");
    const b: BookingRecord = {
      id: randomUUID(), customerId, providerId: input.providerId ?? null, mode: input.mode, state: "Requested",
      totalCentimes: input.totalCentimes, feeCentimes: platformFee(input.totalCentimes), paymentMethod: input.paymentMethod, version: 0, events: [],
    };
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
      this.published.push(event);
      return { ...b, allowed: allowedCommands(b, actor) };
    } catch (e) {
      if (e instanceof IllegalTransition) throw new UnprocessableEntityException(e.message);
      throw e;
    }
  }

  async listAll(state: string | undefined, limit = 100) { return this.repo.listAll(state, limit); }
  async getAny(id: string) { const b = await this.repo.get(id); if (!b) throw new NotFoundException(); return b; }
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
