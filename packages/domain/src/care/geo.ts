/** Geometry and geofencing for location sharing. */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in meters (haversine). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidLatLng(p: LatLng): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

export interface Geofence extends LatLng {
  radiusM: number;
}

export interface Fix extends LatLng {
  /** Horizontal accuracy (radius, meters). */
  accuracyM: number;
}

export type PresenceState = 'inside' | 'outside';

export interface GeofenceResult {
  state: PresenceState | null;
  event: 'arrived' | 'left' | null;
}

/** Extra distance beyond the radius before "left" fires, to avoid flapping at the edge. */
export function hysteresisMeters(radiusM: number): number {
  return Math.max(30, radiusM * 0.25);
}

/**
 * Evaluates one location fix against a place with hysteresis:
 * - enter when the fix is within the radius (allowing for half of its accuracy),
 * - leave only when it is clearly beyond radius + hysteresis (accounting for accuracy),
 * - fixes too inaccurate to decide (accuracy larger than twice the radius) keep the state.
 * An unknown previous state is initialised silently: starting to share at home does not
 * announce "arrived at home".
 */
export function evaluateGeofence(
  previous: PresenceState | null,
  place: Geofence,
  fix: Fix,
): GeofenceResult {
  const distance = haversineMeters(place, fix);
  const accuracy = Math.max(0, fix.accuracyM);
  const clearlyInside = distance + accuracy / 2 <= place.radiusM;
  const clearlyOutside = distance - accuracy > place.radiusM + hysteresisMeters(place.radiusM);
  const tooCoarse = accuracy > Math.max(2 * place.radiusM, 100);

  if (tooCoarse) return { state: previous, event: null };
  if (previous === null) {
    if (clearlyInside) return { state: 'inside', event: null };
    if (distance > place.radiusM) return { state: 'outside', event: null };
    return { state: null, event: null };
  }
  if (previous === 'outside' && clearlyInside) return { state: 'inside', event: 'arrived' };
  if (previous === 'inside' && clearlyOutside) return { state: 'outside', event: 'left' };
  return { state: previous, event: null };
}
