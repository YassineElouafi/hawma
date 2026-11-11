/** Double-entry ledger (docs §3.5). Every transaction must sum to zero. */
import type { Centimes } from "./money";
import { platformFee, type FeePolicy, DEFAULT_FEES } from "./money";

export type Account =
  | "customer_wallet" | "provider_earnings" | "provider_cash_held" | "platform_revenue"
  | "platform_float" | "promo_expense" | "gateway_clearing" | "refund_reserve";

export interface Entry { account: Account; owner?: string; amount: Centimes } // signed: + debit, − credit
export interface Txn { id: string; kind: string; entries: Entry[] }

export class UnbalancedTxn extends Error {}

export function assertBalanced(t: Txn): Txn {
  const sum = t.entries.reduce((s, e) => s + e.amount, 0);
  if (sum !== 0) throw new UnbalancedTxn(`txn ${t.id} (${t.kind}) off by ${sum}`);
  if (t.entries.some((e) => !Number.isInteger(e.amount))) throw new UnbalancedTxn(`txn ${t.id} has non-integer amounts`);
  return t;
}

/** Cash job settled: provider collected cash and owes the platform fee. */
export function settleCashJob(id: string, provider: string, total: Centimes, fees: FeePolicy = DEFAULT_FEES): Txn {
  const fee = platformFee(total, fees);
  return assertBalanced({ id, kind: "cash_job_settled", entries: [
    { account: "provider_cash_held", owner: provider, amount: total },
    { account: "provider_earnings", owner: provider, amount: -(total - fee) },
    { account: "platform_revenue", amount: -fee },
  ] });
}

/** Card job captured: gateway pays the platform, earnings credited to provider. */
export function settleCardJob(id: string, provider: string, total: Centimes, promo: Centimes = 0, fees: FeePolicy = DEFAULT_FEES): Txn {
  const fee = platformFee(total, fees);
  const charged = total - promo;
  return assertBalanced({ id, kind: "card_job_settled", entries: [
    { account: "gateway_clearing", amount: charged },
    ...(promo ? [{ account: "promo_expense" as Account, amount: promo }] : []),
    { account: "provider_earnings", owner: provider, amount: -(total - fee) },
    { account: "platform_revenue", amount: -fee },
  ] });
}

export function refund(id: string, provider: string, amount: Centimes, providerShare: Centimes): Txn {
  return assertBalanced({ id, kind: "refund", entries: [
    { account: "refund_reserve", amount: amount - providerShare },
    { account: "provider_earnings", owner: provider, amount: providerShare },
    { account: "gateway_clearing", amount: -amount },
  ] });
}

export const balanceOf = (txns: Txn[], account: Account, owner?: string): Centimes =>
  txns.flatMap((t) => t.entries).filter((e) => e.account === account && (owner === undefined || e.owner === owner)).reduce((s, e) => s + e.amount, 0);

/** Provider's net cash debt to the platform = fees not yet netted. */
export const cashOwed = (txns: Txn[], provider: string): Centimes => {
  const held = balanceOf(txns, "provider_cash_held", provider);
  const earned = -balanceOf(txns, "provider_earnings", provider);
  return held - earned; // cash collected minus what the provider is entitled to keep
};

/** Customer was owed money back for a cash job: the provider now owes it (the platform will repay the customer). Increases provider_cash_held debt, books a refund liability. */
export function cashRefund(id: string, provider: string, amount: Centimes): Txn {
  return assertBalanced({ id, kind: "cash_refund", entries: [
    { account: "provider_cash_held", owner: provider, amount },
    { account: "refund_reserve", amount: -amount },
  ] });
}
