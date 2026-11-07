/** Money helpers — integer MAD centimes avoid float drift (1 MAD = 100 centimes). */
export type Centimes = number;
export const mad = (v: number): Centimes => Math.round(v * 100);

export interface FeePolicy { commissionBps: number; minFee: Centimes; maxFee?: Centimes }
export const DEFAULT_FEES: FeePolicy = { commissionBps: 1500, minFee: mad(5) };

export function platformFee(total: Centimes, p: FeePolicy = DEFAULT_FEES): Centimes {
  let fee = Math.round((total * p.commissionBps) / 10_000);
  fee = Math.max(fee, Math.min(p.minFee, total));
  if (p.maxFee !== undefined) fee = Math.min(fee, p.maxFee);
  return fee;
}

/** Cancellation fee schedule (docs §F8). Returns the share owed to the provider. */
export function cancellationFee(by: "customer" | "provider", hoursBeforeStart: number, providerEnRoute: boolean, total: Centimes): { fee: Centimes; credit: Centimes; reliabilityHit: boolean } {
  if (by === "customer") {
    if (!providerEnRoute && hoursBeforeStart > 24) return { fee: 0, credit: 0, reliabilityHit: false };
    if (!providerEnRoute && hoursBeforeStart >= 2) return { fee: Math.round(total * 0.1), credit: 0, reliabilityHit: false };
    return { fee: Math.round(total * 0.3), credit: 0, reliabilityHit: false };
  }
  if (hoursBeforeStart > 24) return { fee: 0, credit: 0, reliabilityHit: false };
  return { fee: 0, credit: mad(20), reliabilityHit: true };
}
