import { type CurrencyCode, isCurrencyCode } from '@fp/domain/money';
import { todayLocalDate } from '@/features/finance/hooks';

/** Whole days between two `YYYY-MM-DD` dates (b - a), DST-safe via UTC. */
export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export type TripPhase = 'upcoming' | 'ongoing' | 'past';

export function tripPhase(trip: { startDate: string; endDate: string }): TripPhase {
  const today = todayLocalDate();
  if (trip.endDate < today) return 'past';
  if (trip.startDate > today) return 'upcoming';
  return 'ongoing';
}

/** ISO instant -> value for `<input type="datetime-local">` in the browser's zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `<input type="datetime-local">` value -> ISO instant (or null when empty). */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export { todayLocalDate };

/** `YYYY-MM-DD` -> a noon-UTC instant, so formatting in any household zone keeps the day. */
export function noon(localDate: string): string {
  return `${localDate}T12:00:00Z`;
}

/** Narrows an API currency string; unknown codes fall back to the household currency. */
export function asCurrency(code: string, fallback: CurrencyCode): CurrencyCode {
  return isCurrencyCode(code) ? code : fallback;
}
