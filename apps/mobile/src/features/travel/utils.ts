import type { TripItem } from '@fp/contracts';
import { type CurrencyCode, isCurrencyCode } from '@fp/domain/money';
import { dayKey } from '@/features/calendar/dates';

/** Whole days between two `YYYY-MM-DD` dates (b - a), DST-safe via UTC. */
export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export type TripPhase = 'upcoming' | 'ongoing' | 'past';

export function tripPhase(trip: { startDate: string; endDate: string }, today: string): TripPhase {
  if (trip.endDate < today) return 'past';
  if (trip.startDate > today) return 'upcoming';
  return 'ongoing';
}

/** Narrows an API currency string; unknown codes fall back to the household currency. */
export function asCurrency(code: string, fallback: CurrencyCode): CurrencyCode {
  return isCurrencyCode(code) ? code : fallback;
}

export interface ItineraryDay {
  /** `YYYY-MM-DD`, or null for items without a time. */
  day: string | null;
  items: TripItem[];
}

/** Itinerary grouped by local day in chronological order; undated items come last. */
export function groupItinerary(items: readonly TripItem[]): ItineraryDay[] {
  const sorted = [...items].sort((a, b) => {
    if (a.startAt && b.startAt) return a.startAt.localeCompare(b.startAt);
    if (a.startAt) return -1;
    if (b.startAt) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
  const groups: ItineraryDay[] = [];
  for (const item of sorted) {
    const day = item.startAt ? dayKey(new Date(item.startAt)) : null;
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}
