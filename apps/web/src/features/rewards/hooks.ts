'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useHousehold } from '@/features/household/household-context';

/** Adults manage the catalogue, decide requests and book pocket money. */
export function useIsRewardsAdult(): boolean {
  const { member, can } = useHousehold();
  return (
    can('rewards.write') &&
    (member.role === 'owner' || member.role === 'admin' || member.role === 'adult')
  );
}

export function useInvalidateRewards(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: ['rewards'] }), [queryClient]);
}

/** Members that collect points / pocket money (children and teens first, then everyone else). */
export function useEarners() {
  const { members } = useHousehold();
  const order = { child: 0, teen: 1, adult: 2, admin: 3, owner: 4, caregiver: 5 } as const;
  return members
    .filter((m) => m.role !== 'caregiver')
    .slice()
    .sort((a, b) => order[a.role] - order[b.role]);
}

export function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
