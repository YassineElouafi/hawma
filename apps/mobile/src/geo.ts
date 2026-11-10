const R = 6_371_000; const rad = (d: number) => (d * Math.PI) / 180;
export const distanceM = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
/** Rough city ETA at ~20 km/h average, never below 1 minute. */
export const etaMin = (m: number) => Math.max(1, Math.round(m / 333));
