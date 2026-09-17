import type { GeoPoint, PlaceScale } from '@/lib/shared/types';

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: Pick<GeoPoint, 'lat' | 'lng'>, b: Pick<GeoPoint, 'lat' | 'lng'>): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dPhi = rad(b.lat - a.lat);
  const dLambda = rad(b.lng - a.lng);
  const h = Math.sin(dPhi / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLambda / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const THRESHOLD_KM: Record<Exclude<PlaceScale, 'country'>, number> = { poi: 50, city: 50, region: 300 };

/**
 * The mismatch threshold scales with how specific the claim is: 50 km for a
 * city or point of interest, 300 km for a region, and a country comparison for
 * a country-level claim.
 */
export function isLocationMismatch(claim: GeoPoint, scene: GeoPoint): boolean {
  if (claim.scale === 'country') {
    if (claim.country && scene.country) return normalizeCountry(claim.country) !== normalizeCountry(scene.country);
    return haversineKm(claim, scene) > 1000;
  }
  return haversineKm(claim, scene) > THRESHOLD_KM[claim.scale];
}

export function normalizeCountry(name: string): string {
  return name.trim().toLowerCase().replace(/^the\s+/, '');
}

/** Maps a Google Maps place type string to how specific the place is. */
export function scaleFromPlaceType(type: string | undefined): PlaceScale {
  const t = (type ?? '').toLowerCase();
  if (/country|nation/.test(t)) return 'country';
  if (/state|province|region|administrative area|division|union territory/.test(t)) return 'region';
  if (/city|town|village|locality|municipality|district/.test(t)) return 'city';
  return 'poi';
}
