// Straight-line distance (Haversine, ADR-011). Always labelled "approximate straight-line"
// in the UI (BR-033); the route distance is confirmed by the carrier.

const EARTH_RADIUS_KM = 6371.0088;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rounds to one decimal place, the stored precision numeric(8,1). */
export const round1 = (km: number) => Math.round(km * 10) / 10;

export type DistanceBand = 'B1' | 'B2' | 'B3' | 'B4';

/** BR-032: B1 ≤ 50 < B2 ≤ 150 < B3 ≤ 300 < B4 (configurable engineering values). */
export function distanceBand(km: number, limits = { B1: 50, B2: 150, B3: 300 }): DistanceBand {
  if (km <= limits.B1) return 'B1';
  if (km <= limits.B2) return 'B2';
  if (km <= limits.B3) return 'B3';
  return 'B4';
}

export const STRAIGHT_LINE_LABEL = 'مسافة مباشرة تقريبية';
export const ROUTE_ESTIMATE_LABEL = 'تقدير لمسافة الطريق';
export const ROUTE_CONFIRMED_LABEL = 'يؤكدها الناقل';
