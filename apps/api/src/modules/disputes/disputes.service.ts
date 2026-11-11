import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { BookingsService } from "../bookings/bookings.service";
import type { LedgerService } from "../ledger/ledger.service";

export type Outcome = "reject" | "refund_full" | "refund_partial";
export interface Dispute { id: string; bookingId: string; openedBy: string; reason: string; status: "open" | "resolved"; outcome?: Outcome; refundCentimes?: number; resolutionNote?: string; resolvedBy?: string; createdAt: string; resolvedAt?: string }
export interface DisputeRepo {
  create(d: { bookingId: string; openedBy: string; reason: string }): Promise<Dispute>;                       // throws ConflictException if one exists
  get(id: string): Promise<Dispute | undefined>;
  forBooking(bookingId: string): Promise<Dispute | undefined>;
  list(status: "open" | "resolved", limit: number): Promise<Dispute[]>;
  /** Atomic open→resolved; returns undefined if somebody else resolved it first. */
  resolve(id: string, r: { outcome: Outcome; refundCentimes?: number; note: string; by: string }): Promise<Dispute | undefined>;
}
export class MemoryDisputeRepo implements DisputeRepo {
  items = new Map<string, Dispute>();
  async create(d: { bookingId: string; openedBy: string; reason: string }) { if ([...this.items.values()].some((x) => x.bookingId === d.bookingId)) throw new ConflictException("this booking already has a dispute"); const v: Dispute = { ...d, id: crypto.randomUUID(), status: "open", createdAt: new Date().toISOString() }; this.items.set(v.id, v); return { ...v }; }
  async get(id: string) { const v = this.items.get(id); return v && { ...v }; }
  async forBooking(b: string) { const v = [...this.items.values()].find((x) => x.bookingId === b); return v && { ...v }; }
  async list(status: "open" | "resolved", limit: number) { return [...this.items.values()].filter((x) => x.status === status).slice(0, limit).map((x) => ({ ...x })); }
  async resolve(id: string, r: { outcome: Outcome; refundCentimes?: number; note: string; by: string }) { const v = this.items.get(id); if (!v || v.status !== "open") return undefined; Object.assign(v, { status: "resolved", outcome: r.outcome, refundCentimes: r.refundCentimes, resolutionNote: r.note, resolvedBy: r.by, resolvedAt: new Date().toISOString() }); return { ...v }; }
}

@Injectable()
export class DisputesService {
  constructor(@Inject("DISPUTE_REPO") private repo: DisputeRepo, @Inject("BOOKINGS") private bookings: BookingsService, @Inject("LEDGER") private ledger: LedgerService) {}

  /** The customer reports a problem before confirming a completed job. Freezes settlement (state Disputed). */
  async open(customerId: string, bookingId: string, reason: string) {
    if (reason.trim().length < 10) throw new BadRequestException("please describe the problem (at least 10 characters)");
    const b = await this.bookings.getAny(bookingId);
    if (b.customerId !== customerId) throw new ForbiddenException("only the customer can open a dispute");
    if (b.state !== "Completed") throw new UnprocessableEntityException("a dispute can only be opened on a completed job that is not yet confirmed");
    await this.bookings.command(bookingId, "dispute", customerId);                                       // the state change is the lock: only one concurrent opener can win it
    return this.repo.create({ bookingId, openedBy: customerId, reason: reason.trim() });
  }

  list(status: "open" | "resolved" = "open") { return this.repo.list(status, 100); }
  forBooking(bookingId: string) { return this.repo.forBooking(bookingId); }

  /** Staff decision. reject → provider is paid; refund_full → provider repays the whole amount; refund_partial → paid for the rest, repays the refunded part. */
  async resolve(staffId: string, disputeId: string, outcome: Outcome, note: string, refundCentimes?: number) {
    const d = await this.repo.get(disputeId); if (!d) throw new NotFoundException();
    if (d.status !== "open") throw new ConflictException("dispute already resolved");
    const b = await this.bookings.getAny(d.bookingId);
    if (outcome === "refund_partial" && (!refundCentimes || refundCentimes <= 0 || refundCentimes >= b.totalCentimes)) throw new UnprocessableEntityException("partial refund must be between 0 and the job total");
    const refund = outcome === "refund_full" ? b.totalCentimes : outcome === "refund_partial" ? refundCentimes! : 0;
    const done = await this.repo.resolve(disputeId, { outcome, refundCentimes: refund || undefined, note, by: staffId });
    if (!done) throw new ConflictException("dispute already resolved");                                // lost a race with another reviewer
    await this.bookings.command(d.bookingId, outcome === "refund_full" ? "refund" : "settle", staffId, { staff: true });
    await this.ledger.applyDisputeOutcome(d.bookingId, d.id, refund);
    return done;
  }
}
