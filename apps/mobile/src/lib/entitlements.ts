import { apiQuery } from '@fp/api-client';
import type { Entitlements } from '@fp/contracts';
import { useQuery } from '@tanstack/react-query';
import { useHousehold } from '@/features/household/household';
import { api } from './api';

export type PlanFeature = Entitlements['features'][number];

/** Subscription + entitlements of the active household (readable by every member). */
export function useSubscription() {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'billing', 'subscription', { params: { householdId } }),
    staleTime: 5 * 60_000,
  });
}

/**
 * Whether the household's plan includes a feature; `enabled` is undefined while loading so
 * screens can show a spinner instead of flashing an upsell.
 */
export function useFeature(feature: PlanFeature): { enabled: boolean | undefined } {
  const query = useSubscription();
  if (query.isPending) return { enabled: undefined };
  // Billing unavailable (offline etc.): let the API decide; 402 responses still show an upsell.
  if (query.isError) return { enabled: true };
  return { enabled: query.data.entitlements.features.includes(feature) };
}
