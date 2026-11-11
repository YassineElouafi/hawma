import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { assertBalanced, settleCardJob, settleCashJob, type Account, type Txn } from "../../domain/ledger";
import type { BookingRepo } from "../bookings/bookings.service";

/** Deterministic UUID from a business key so the same booking always maps to the same ledger transaction (idempotency). */
export const txnIdFor = (key: string) => { const h = createHash("sha256").update(key).digest(); h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80; const x = h.subarray(0, 16).toString("hex"); return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`; };

export interface LedgerRepo {
  /** Atomically posts the transaction unless one with the same id already exists. Returns true if newly posted. */
  post(t: Txn): Promise<boolean>;
  balance(account: Account, ownerId?: string): Promise<number>;
  /** Sum of entries per owner for one account. */
  balances(account: Account, ownerIds: string[]): Promise<Map<string, number>>;
  totals(): Promise<{ platformRevenue: number; cashHeld: number; earnings: number }>;
}
export class MemoryLedgerRepo implements LedgerRepo {
  txns = new Map<string, Txn>();
  async post(t: Txn) { assertBalanced(t); if (this.txns.has(t.id)) return false; this.txns.set(t.id, structuredClone(t)); return true; }
  async balance(account: Account, ownerId?: string) { return [...this.txns.values()].flatMap((t) => t.entries).filter((e) => e.account === account && (ownerId === undefined || e.owner === ownerId)).reduce((s, e) => s + e.amount, 0); }
  async balances(account: Account, ids: string[]) { const m = new Map<string, number>(); for (const id of ids) m.set(id, await this.balance(account, id)); return m; }
  async totals() { return { platformRevenue: -(await this.balance("platform_revenue")), cashHeld: await this.balance("provider_cash_held"), earnings: -(await this.balance("provider_earnings")) }; }
}

export interface ProviderMoney { netEarningsCentimes: number; cashOwedCentimes: number; jobsSettled: number }

@Injectable()
export class LedgerService {
  constructor(@Inject("LEDGER_REPO") private repo: LedgerRepo, @Inject("BOOKING_REPO") private bookings: BookingRepo) {}

  /** Called when a booking is confirmed (via the outbox, at-least-once). Idempotent. */
  async settleBooking(bookingId: string): Promise<"posted" | "duplicate" | "skipped"> {
    const b = await this.bookings.get(bookingId);
    if (!b || !b.providerId || b.totalCentimes <= 0) return "skipped";
    const id = txnIdFor(`booking:${bookingId}:settle`);
    const txn = b.paymentMethod === "cash" ? settleCashJob(id, b.providerId, b.totalCentimes) : b.paymentMethod === "card" ? settleCardJob(id, b.providerId, b.totalCentimes) : undefined;
    if (!txn) return "skipped";
    return (await this.repo.post(txn)) ? "posted" : "duplicate";
  }

  async providerMoney(providerId: string): Promise<ProviderMoney> {
    const [held, earn] = await Promise.all([this.repo.balance("provider_cash_held", providerId), this.repo.balance("provider_earnings", providerId)]);
    return { netEarningsCentimes: -earn, cashOwedCentimes: Math.max(0, held + earn), jobsSettled: 0 };
  }
  async cashOwedFor(ids: string[]) { const [h, e] = await Promise.all([this.repo.balances("provider_cash_held", ids), this.repo.balances("provider_earnings", ids)]); return new Map(ids.map((id) => [id, Math.max(0, (h.get(id) ?? 0) + (e.get(id) ?? 0))])); }
  totals() { return this.repo.totals(); }
}
