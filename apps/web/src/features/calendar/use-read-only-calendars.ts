'use client';

import { apiQuery } from '@fp/api-client';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';

const EMPTY: ReadonlySet<string> = new Set();

/**
 * Ids of calendars that mirror an ICS subscription. The calendar contract has no read-only flag,
 * so we derive it from the subscriptions; the API answers edits with 400 `calendar_read_only`.
 */
export function useReadOnlyCalendarIds(): ReadonlySet<string> {
  const { householdId, can } = useHousehold();
  const query = useQuery({
    ...apiQuery(api, 'calendarSync', 'listSubscriptions', { params: { householdId } }),
    enabled: can('calendar.read'),
    staleTime: 5 * 60_000,
  });
  return useMemo(
    () => (query.data ? new Set(query.data.map((s) => s.calendarId)) : EMPTY),
    [query.data],
  );
}
