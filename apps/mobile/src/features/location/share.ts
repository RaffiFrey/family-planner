import { MAX_LOCATION_SHARE_MINUTES } from '@fp/contracts';

/** Duration choices on the opt-in screen. Sharing always ends automatically (max. 7 days). */
export const SHARE_DURATIONS = ['60', 'tonight', '480', '1440', '10080'] as const;
export type ShareDuration = (typeof SHARE_DURATIONS)[number];

const MIN_MINUTES = 5;

/** End of "tonight": 23:59 today, or 23:59 tomorrow when it is already that late. */
export function tonight(now: Date): Date {
  const end = new Date(now);
  end.setHours(23, 59, 0, 0);
  if (end.getTime() - now.getTime() < MIN_MINUTES * 60_000) end.setDate(end.getDate() + 1);
  return end;
}

/** Minutes for the API (`durationMinutes`), clamped to the contract's 5 min … 7 days. */
export function durationMinutes(choice: ShareDuration, now: Date = new Date()): number {
  const raw =
    choice === 'tonight'
      ? Math.round((tonight(now).getTime() - now.getTime()) / 60_000)
      : Number(choice);
  return Math.min(MAX_LOCATION_SHARE_MINUTES, Math.max(MIN_MINUTES, raw));
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in metres. */
export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const PING_MIN_INTERVAL_MS = 60_000;
export const PING_MIN_MOVE_M = 50;

/** Throttle: at most one ping per minute unless the position moved noticeably. */
export function shouldSendPing(
  previous: (LatLng & { at: number }) | null,
  next: LatLng,
  now: number,
): boolean {
  if (!previous) return true;
  return now - previous.at >= PING_MIN_INTERVAL_MS || distanceM(previous, next) >= PING_MIN_MOVE_M;
}

/** Clamps a device accuracy (may be null/negative) to the API range. */
export function clampAccuracy(accuracy: number | null | undefined): number {
  if (accuracy == null || !Number.isFinite(accuracy)) return 100;
  return Math.min(100_000, Math.max(0, accuracy));
}

/** Parses a coordinate typed with a comma or dot; null when invalid or out of range. */
export function parseCoordinate(text: string, kind: 'lat' | 'lng'): number | null {
  const n = Number(text.trim().replace(',', '.'));
  if (text.trim() === '' || !Number.isFinite(n)) return null;
  const max = kind === 'lat' ? 90 : 180;
  return Math.abs(n) <= max ? n : null;
}

/** Map region that shows all points (with a sensible minimum zoom). */
export function regionFor(points: readonly LatLng[]): {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
} | null {
  if (points.length === 0) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.5),
    longitudeDelta: Math.max(0.01, (maxLng - minLng) * 1.5),
  };
}
