import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { DisputesService, MemoryDisputeRepo } from "../src/modules/disputes/disputes.service";
import { LedgerService, MemoryLedgerRepo } from "../src/modules/ledger/ledger.service";
import { BookingsService, MemoryBookingRepo } from "../src/modules/bookings/bookings.service";
import { mad } from "../src/domain/money";

async function setup(total = mad(200), method: "cash" | "card" = "cash") {
  const repo = new MemoryBookingRepo(), bookings = new BookingsService(repo), ledger = new LedgerService(new MemoryLedgerRepo(), repo), disputes = new DisputesService(new MemoryDisputeRepo(), bookings, ledger);
  const cust = randomUUID(), prov = randomUUID();
  const b = await bookings.create(cust, { mode: "catalogue", providerId: prov, totalCentimes: total, paymentMethod: method });
  for (const c of ["accept", "start_trip", "arrive", "start_job", "complete"] as const) await bookings.command(b.id, c, prov);
  return { bookings, ledger, disputes, cust, prov, b };
}

describe("disputes", () => {
  it("only the customer, only on a completed unconfirmed job, with a real description, once", async () => {
    const s = await setup();
    await expect(s.disputes.open(s.prov, s.b.id, "the provider is the wrong person here")).rejects.toThrow(/only the customer/);
    await expect(s.disputes.open(s.cust, s.b.id, "bad")).rejects.toThrow(/describe/);
    const d = await s.disputes.open(s.cust, s.b.id, "Le ménage n'a pas été fait dans la cuisine");
    expect((await s.bookings.getAny(s.b.id)).state).toBe("Disputed"); expect(d.status).toBe("open");
    await expect(s.disputes.open(s.cust, s.b.id, "second attempt, same booking")).rejects.toThrow();
    const early = await s.bookings.create(s.cust, { mode: "catalogue", providerId: s.prov, totalCentimes: 100, paymentMethod: "cash" });
    await expect(s.disputes.open(s.cust, early.id, "job has not even started yet")).rejects.toThrow(/completed/);
  });

  it("a disputed job can never be confirmed, so settlement cannot fire while it is open", async () => {
    const s = await setup(); await s.disputes.open(s.cust, s.b.id, "Le travail est incomplet et mal fait");
    await expect(s.bookings.command(s.b.id, "confirm", s.cust)).rejects.toThrow();
    expect((await s.ledger.providerMoney(s.prov)).cashOwedCentimes).toBe(0);
  });

  it("reject: provider is paid as normal", async () => {
    const s = await setup(); const d = await s.disputes.open(s.cust, s.b.id, "Le travail est incomplet et mal fait");
    const fresh = await setup(); const d2 = await fresh.disputes.open(fresh.cust, fresh.b.id, "Le travail est incomplet et mal fait");
    await fresh.disputes.resolve("staff", d2.id, "reject", "photos show the job was done");
    expect((await fresh.bookings.getAny(fresh.b.id)).state).toBe("Settled");
    expect(await fresh.ledger.providerMoney(fresh.prov)).toMatchObject({ netEarningsCentimes: mad(170), cashOwedCentimes: mad(30) });
    expect(d.id).not.toBe(d2.id);
  });

  it("refund_full: no earnings, provider owes the customer's money back", async () => {
    const s = await setup(); const d = await s.disputes.open(s.cust, s.b.id, "Personne n'est venu, je l'ai payé quand même");
    const r = await s.disputes.resolve("staff", d.id, "refund_full", "provider no-show confirmed");
    expect(r).toMatchObject({ outcome: "refund_full", refundCentimes: mad(200) });
    expect((await s.bookings.getAny(s.b.id)).state).toBe("Refunded");
    expect(await s.ledger.providerMoney(s.prov)).toMatchObject({ netEarningsCentimes: 0, cashOwedCentimes: mad(200) });
  });

  it("refund_partial: paid for the rest (with fee), owes the refunded part; bounds enforced", async () => {
    const s = await setup(mad(200)); const d = await s.disputes.open(s.cust, s.b.id, "Seulement la moitié du travail a été faite");
    await expect(s.disputes.resolve("staff", d.id, "refund_partial", "half the job", mad(200))).rejects.toThrow(/between/);
    await expect(s.disputes.resolve("staff", d.id, "refund_partial", "half the job")).rejects.toThrow(/between/);
    await s.disputes.resolve("staff", d.id, "refund_partial", "half the job done", mad(80));
    expect((await s.bookings.getAny(s.b.id)).state).toBe("Settled");
    expect(await s.ledger.providerMoney(s.prov)).toMatchObject({ netEarningsCentimes: mad(102), cashOwedCentimes: mad(18) + mad(80) });   // kept 120: net 102, fee 18; refund 80 owed on top
  });

  it("resolving twice is refused and never double-posts", async () => {
    const s = await setup(); const d = await s.disputes.open(s.cust, s.b.id, "Le travail est incomplet et mal fait");
    await s.disputes.resolve("staff", d.id, "refund_full", "first decision");
    await expect(s.disputes.resolve("staff2", d.id, "reject", "second decision")).rejects.toThrow(/already resolved/);
    expect((await s.ledger.providerMoney(s.prov)).cashOwedCentimes).toBe(mad(200));
  });
});
