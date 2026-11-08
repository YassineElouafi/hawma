export const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
export const haversineM = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
/** Bounding box prefilter for index-friendly queries; the exact distance check follows. */
export const bbox = (lat: number, lng: number, radiusM: number) => {
  const dLat = (radiusM / R) * (180 / Math.PI);
  const dLng = dLat / Math.max(0.01, Math.cos(rad(lat)));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
};
/** Customers see a ~300 m rounded point, never a provider's exact home (docs §6.2). */
export const fuzz = (lat: number, lng: number, gridM = 300) => {
  const stepLat = (gridM / R) * (180 / Math.PI);
  const snappedLat = Math.round(lat / stepLat) * stepLat;
  // derive the longitude step from the SNAPPED latitude so the mapping is idempotent
  const stepLng = stepLat / Math.max(0.01, Math.cos(rad(snappedLat)));
  return { lat: snappedLat, lng: Math.round(lng / stepLng) * stepLng };
};
