'use client';

import { apiQuery } from '@fp/api-client';
import type { Entitlements } from '@fp/contracts';
import { useQuery } from '@tanstack/react-query';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';

export type PlanFeature = Entitlements['features'][number];

/** Subscription + entitlements of the current household (readable by every member). */
export function useSubscription() {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'billing', 'subscription', { params: { householdId } }),
    staleTime: 5 * 60_000,
  });
}

/**
 * Whether the household's plan includes a feature. `enabled` is `undefined` while loading,
 * so callers can render a skeleton instead of flashing an upsell.
 */
export function useFeature(feature: PlanFeature): {
  enabled: boolean | undefined;
  isPending: boolean;
} {
  const query = useSubscription();
  if (query.isPending) return { enabled: undefined, isPending: true };
  // If billing cannot be loaded, let the API decide (402 responses still show an upsell).
  if (query.isError) return { enabled: true, isPending: false };
  return { enabled: query.data.entitlements.features.includes(feature), isPending: false };
}
