import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, apiQuery } from '@fp/api-client';
import type { ContactCategory } from '@fp/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useHousehold, useMembers } from '@/features/household/household';
import { api } from '@/lib/api';
import {
  loadEmergencySummary,
  saveEmergencySummary,
  type StoredEmergencySummary,
} from './offline-store';

export const CONTACT_CATEGORIES = [
  'doctor',
  'school',
  'kita',
  'babysitter',
  'family',
  'emergency',
  'craftsman',
  'other',
] as const satisfies readonly ContactCategory[];

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', '0+', '0-', 'unknown'] as const;

export function useContacts(filter: { category?: ContactCategory; q?: string } = {}) {
  const { householdId } = useHousehold();
  const query: { category?: ContactCategory; q?: string } = {};
  if (filter.category) query.category = filter.category;
  if (filter.q) query.q = filter.q;
  return useQuery(apiQuery(api, 'contacts', 'list', { params: { householdId }, query }));
}

export function useContact(contactId: string, enabled = true) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'contacts', 'get', { params: { householdId, contactId } }),
    enabled: enabled && contactId !== '',
  });
}

export function useEmergencyCards() {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: ['contacts', 'emergency.list', { householdId }],
    queryFn: () => api.contacts.emergency.list({ params: { householdId } }),
  });
}

export function useEmergencyCard(memberId: string) {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: ['contacts', 'emergency.get', { householdId, memberId }],
    queryFn: async () => {
      try {
        return await api.contacts.emergency.get({ params: { householdId, memberId } });
      } catch (e) {
        // No card yet: the form starts empty.
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
}

export interface EmergencySummaryResult extends StoredEmergencySummary {
  /** `offline` when the server was unreachable and the device copy is shown. */
  source: 'live' | 'offline';
}

/** Network failures and server errors fall back to the device copy; 403/404 do not. */
function canFallBack(e: unknown): boolean {
  return !(e instanceof ApiError) || e.status >= 500;
}

function summaryQuery(householdId: string, memberId: string) {
  return {
    queryKey: ['contacts', 'emergency.summary', { householdId, memberId }] as const,
    queryFn: async (): Promise<EmergencySummaryResult> => {
      try {
        const summary = await api.contacts.emergency.summary({ params: { householdId, memberId } });
        const stored = await saveEmergencySummary(AsyncStorage, householdId, summary);
        return { ...stored, source: 'live' };
      } catch (e) {
        if (canFallBack(e)) {
          const stored = await loadEmergencySummary(AsyncStorage, householdId, memberId);
          if (stored) return { ...stored, source: 'offline' };
        }
        throw e;
      }
    },
    // Must run while offline too, so the persisted copy can be served.
    networkMode: 'always' as const,
    retry: false,
  };
}

/**
 * Emergency summary of a member. Every successful fetch is also written to AsyncStorage, so the
 * card opens without a connection (shown with its "Stand").
 */
export function useEmergencySummary(memberId: string) {
  const { householdId } = useHousehold();
  return useQuery(summaryQuery(householdId, memberId));
}

/**
 * Refreshes the offline emergency cards of all members in the background (contacts screen;
 * can also be called once from the app shell).
 */
export function usePrefetchEmergencyCards(): void {
  const { householdId, can } = useHousehold();
  const members = useMembers();
  const queryClient = useQueryClient();
  const ids = members.map((m) => m.id).join(',');
  const allowed = can('contacts.read');
  useEffect(() => {
    if (!allowed) return;
    for (const id of ids.split(',').filter(Boolean)) {
      queryClient
        .query({ ...summaryQuery(householdId, id), staleTime: 5 * 60_000 })
        .catch(() => undefined);
    }
  }, [allowed, householdId, ids, queryClient]);
}
