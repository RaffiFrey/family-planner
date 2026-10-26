import type { TripItem } from '@fp/contracts';
import { asCurrency, daysBetween, groupItinerary, tripPhase } from './utils';

function item(id: string, startAt: string | null, createdAt = '2026-01-01T00:00:00Z'): TripItem {
  return {
    id,
    tripId: 't',
    kind: 'activity',
    title: id,
    startAt,
    endAt: null,
    location: null,
    confirmationCode: null,
    notes: null,
    attachmentFileIds: [],
    createdAt,
  };
}

describe('travel utils', () => {
  it('counts days', () => {
    expect(daysBetween('2026-03-28', '2026-04-02')).toBe(5);
  });

  it('classifies trips', () => {
    const trip = { startDate: '2026-07-01', endDate: '2026-07-10' };
    expect(tripPhase(trip, '2026-06-30')).toBe('upcoming');
    expect(tripPhase(trip, '2026-07-05')).toBe('ongoing');
    expect(tripPhase(trip, '2026-07-11')).toBe('past');
  });

  it('narrows currencies', () => {
    expect(asCurrency('USD', 'EUR')).toBe('USD');
    expect(asCurrency('XXX-not', 'EUR')).toBe('EUR');
  });

  it('groups the itinerary by day with undated items last', () => {
    const groups = groupItinerary([
      item('note', null),
      item('b', new Date(2026, 6, 2, 9).toISOString()),
      item('a', new Date(2026, 6, 1, 18).toISOString()),
      item('c', new Date(2026, 6, 2, 14).toISOString()),
    ]);
    expect(groups.map((g) => [g.day, g.items.map((i) => i.id)])).toEqual([
      ['2026-07-01', ['a']],
      ['2026-07-02', ['b', 'c']],
      [null, ['note']],
    ]);
  });
});
