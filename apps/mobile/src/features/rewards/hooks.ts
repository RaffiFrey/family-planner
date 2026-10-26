import { apiQuery, type Input, type Output } from '@fp/api-client';
import type { Redemption, Reward } from '@fp/contracts';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { showError } from '@/lib/dialogs';

export type AllowanceRule = Output<'rewards', 'allowanceRules'>[number];

/** Adults manage the catalog, decide requests and book pocket money. */
export function useIsParent(): boolean {
  const { me } = useHousehold();
  return me.role === 'owner' || me.role === 'admin' || me.role === 'adult';
}

/** Household members, refetched whenever a rewards screen opens (new kids appear right away). */
export function useFreshMembers() {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'households', 'get', { params: { householdId } }),
    refetchOnMount: 'always',
  });
}

export function useBalances() {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'rewards', 'balances', { params: { householdId } }),
    refetchOnMount: 'always',
  });
}

export function useCatalog() {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'rewards', 'catalog', { params: { householdId } }),
    refetchOnMount: 'always',
  });
}

export function useRedemptions(status?: Redemption['status']) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'rewards', 'redemptions', {
      params: { householdId },
      ...(status ? { query: { status } } : {}),
    }),
    // Requests are decided on this screen: always show the server's current state.
    refetchOnMount: 'always',
  });
}

export type LeaderboardPeriod = 'week' | 'month';

/** Points earned in the week/month containing `at` (YYYY-MM-DD; defaults to today on the server). */
export function useLeaderboard(period: LeaderboardPeriod = 'week', at?: string) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'rewards', 'leaderboard', {
      params: { householdId },
      query: at ? { period, at } : { period },
    }),
    placeholderData: keepPreviousData,
  });
}

export function usePointsLedger(memberId: string) {
  const { householdId } = useHousehold();
  return useInfiniteQuery({
    queryKey: ['rewards', 'points', { householdId, memberId }],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.rewards.points({
        params: { householdId },
        query: { memberId, limit: 50, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useAllowanceBalances() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'rewards', 'allowanceBalances', { params: { householdId } }));
}

export function useAllowanceRules() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'rewards', 'allowanceRules', { params: { householdId } }));
}

export function useAllowanceLedger(memberId: string | null) {
  const { householdId } = useHousehold();
  return useInfiniteQuery({
    queryKey: ['rewards', 'allowanceLedger', { householdId, memberId }],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.rewards.allowanceLedger({
        params: { householdId },
        query: {
          limit: 50,
          ...(memberId ? { memberId } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        },
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useRewardMutations() {
  const { householdId } = useHousehold();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['rewards'] });
  const onError = (e: unknown) => {
    showError(e, t);
  };
  const opts = { onSettled: invalidate, onError };

  return {
    redeem: useMutation({
      mutationFn: (reward: Reward) =>
        api.rewards.redeem({ params: { householdId, rewardId: reward.id }, body: {} }),
      ...opts,
    }),
    approve: useMutation({
      mutationFn: (r: Redemption) =>
        api.rewards.approveRedemption({ params: { householdId, redemptionId: r.id }, body: {} }),
      ...opts,
    }),
    reject: useMutation({
      mutationFn: (r: Redemption) =>
        api.rewards.rejectRedemption({ params: { householdId, redemptionId: r.id }, body: {} }),
      ...opts,
    }),
    cancel: useMutation({
      mutationFn: (r: Redemption) =>
        api.rewards.cancelRedemption({ params: { householdId, redemptionId: r.id } }),
      ...opts,
    }),
    createReward: useMutation({
      mutationFn: (body: Input<'rewards', 'createReward'>['body']) =>
        api.rewards.createReward({ params: { householdId }, body }),
      ...opts,
    }),
    updateReward: useMutation({
      mutationFn: ({
        reward,
        body,
      }: {
        reward: Reward;
        body: Input<'rewards', 'updateReward'>['body'];
      }) => api.rewards.updateReward({ params: { householdId, rewardId: reward.id }, body }),
      ...opts,
    }),
    createAllowanceRule: useMutation({
      mutationFn: (body: Input<'rewards', 'createAllowanceRule'>['body']) =>
        api.rewards.createAllowanceRule({ params: { householdId }, body }),
      ...opts,
    }),
    updateAllowanceRule: useMutation({
      mutationFn: ({
        rule,
        body,
      }: {
        rule: AllowanceRule;
        body: Input<'rewards', 'updateAllowanceRule'>['body'];
      }) => api.rewards.updateAllowanceRule({ params: { householdId, ruleId: rule.id }, body }),
      ...opts,
    }),
    removeAllowanceRule: useMutation({
      mutationFn: (rule: AllowanceRule) =>
        api.rewards.removeAllowanceRule({ params: { householdId, ruleId: rule.id } }),
      ...opts,
    }),
    removeReward: useMutation({
      mutationFn: (reward: Reward) =>
        api.rewards.removeReward({ params: { householdId, rewardId: reward.id } }),
      ...opts,
    }),
    adjustPoints: useMutation({
      mutationFn: (body: Input<'rewards', 'adjustPoints'>['body']) =>
        api.rewards.adjustPoints({ params: { householdId }, body }),
      ...opts,
    }),
    addAllowanceEntry: useMutation({
      mutationFn: (body: Input<'rewards', 'addAllowanceEntry'>['body']) =>
        api.rewards.addAllowanceEntry({ params: { householdId }, body }),
      ...opts,
    }),
  };
}

/** Parses a signed whole number of points ("10", "-5", "+3"); null when invalid or zero. */
export function parsePointsDelta(input: string): number | null {
  const s = input.trim().replace(/^\+/, '');
  if (!/^-?\d{1,5}$/.test(s)) return null;
  const n = Number(s);
  return n === 0 || Math.abs(n) > 10_000 ? null : n;
}
