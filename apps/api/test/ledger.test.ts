import { describe, expect, it } from "vitest";
import { assertBalanced, balanceOf, cashOwed, refund, settleCardJob, settleCashJob, UnbalancedTxn } from "../src/domain/ledger";
import { cancellationFee, mad, platformFee } from "../src/domain/money";

describe("fees", () => {
  it("takes 15% with a floor", () => {
    expect(platformFee(mad(200))).toBe(mad(30));
    expect(platformFee(mad(10))).toBe(mad(5));       // floor 5 MAD
    expect(platformFee(mad(3))).toBe(mad(3));        // never more than the total
  });
  it("cancellation schedule", () => {
    expect(cancellationFee("customer", 48, false, mad(100)).fee).toBe(0);
    expect(cancellationFee("customer", 5, false, mad(100)).fee).toBe(mad(10));
    expect(cancellationFee("customer", 1, false, mad(100)).fee).toBe(mad(30));
    expect(cancellationFee("customer", 30, true, mad(100)).fee).toBe(mad(30));
    expect(cancellationFee("provider", 3, false, mad(100))).toEqual({ fee: 0, credit: mad(20), reliabilityHit: true });
    expect(cancellationFee("provider", 48, false, mad(100)).reliabilityHit).toBe(false);
  });
});

describe("ledger", () => {
  it("every generated transaction balances to zero", () => {
    for (const total of [mad(1), mad(10), mad(99.99), mad(200), mad(1234.56)]) {
      for (const t of [settleCashJob("a", "p1", total), settleCardJob("b", "p1", total), settleCardJob("c", "p1", total, Math.min(total, mad(20)))])
        expect(t.entries.reduce((s, e) => s + e.amount, 0)).toBe(0);
    }
  });
  it("rejects unbalanced or fractional entries", () => {
    expect(() => assertBalanced({ id: "x", kind: "bad", entries: [{ account: "platform_float", amount: 100 }, { account: "platform_revenue", amount: -99 }] })).toThrow(UnbalancedTxn);
    expect(() => assertBalanced({ id: "y", kind: "frac", entries: [{ account: "platform_float", amount: 0.5 }, { account: "platform_revenue", amount: -0.5 }] })).toThrow(/non-integer/);
  });
  it("cash job: provider keeps 85% and owes the 15% fee", () => {
    const t = settleCashJob("t1", "p1", mad(200));
    expect(balanceOf([t], "provider_earnings", "p1")).toBe(-mad(170));
    expect(balanceOf([t], "platform_revenue")).toBe(-mad(30));
    expect(cashOwed([t], "p1")).toBe(mad(30));
  });
  it("cash owed accumulates over jobs", () => {
    const ts = [settleCashJob("a", "p1", mad(100)), settleCashJob("b", "p1", mad(200)), settleCashJob("c", "p2", mad(500))];
    expect(cashOwed(ts, "p1")).toBe(mad(15) + mad(30));
    expect(cashOwed(ts, "p2")).toBe(mad(75));
  });
  it("card job with promo books promo expense", () => {
    const t = settleCardJob("t2", "p1", mad(100), mad(20));
    expect(balanceOf([t], "promo_expense")).toBe(mad(20));
    expect(balanceOf([t], "gateway_clearing")).toBe(mad(80));
  });
  it("refund balances", () => {
    expect(refund("r", "p1", mad(100), mad(40)).entries.reduce((s, e) => s + e.amount, 0)).toBe(0);
  });
});
