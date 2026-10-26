import { apiQuery } from '@fp/api-client';
import type { Occurrence } from '@fp/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { occurrenceDayKeys } from './dates';

export function useCalendars() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'calendar', 'listCalendars', { params: { householdId } }));
}

/** Occurrences in [from, to). Pass stable ISO strings so the query key doesn't change every render. */
export function useOccurrences(fromIso: string, toIso: string) {
  const { householdId } = useHousehold();
  return useQuery(
    apiQuery(api, 'calendar', 'occurrences', {
      params: { householdId },
      query: { from: fromIso, to: toIso },
    }),
  );
}

export function useEvent(eventId: string | undefined) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'calendar', 'getEvent', { params: { householdId, eventId: eventId ?? '' } }),
    enabled: !!eventId,
  });
}

/** Occurrences per local day key, sorted (all-day first, then by start). */
export function useOccurrencesByDay(
  occurrences: readonly Occurrence[] | undefined,
): Map<string, Occurrence[]> {
  return useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const o of occurrences ?? []) {
      for (const key of occurrenceDayKeys(o)) {
        const list = map.get(key) ?? [];
        list.push(o);
        map.set(key, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) =>
        a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1,
      );
    }
    return map;
  }, [occurrences]);
}
