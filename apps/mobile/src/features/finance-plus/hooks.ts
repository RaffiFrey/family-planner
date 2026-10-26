import { apiQuery } from '@fp/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { showError } from '@/lib/dialogs';

export function useContracts(status: 'active' | 'cancelled' | 'all' = 'all', enabled = true) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'financePlus', 'listContracts', {
      params: { householdId },
      query: { status },
    }),
    enabled,
  });
}

export function useContractSummary(enabled = true) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'financePlus', 'contractSummary', { params: { householdId } }),
    enabled,
  });
}

export function useContractSuggestions(enabled = true) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'financePlus', 'contractSuggestions', { params: { householdId } }),
    enabled,
  });
}

export function useGoals(includeArchived = false) {
  const { householdId } = useHousehold();
  return useQuery(
    apiQuery(api, 'financePlus', 'listGoals', {
      params: { householdId },
      query: { includeArchived: includeArchived ? 'true' : 'false' },
    }),
  );
}

export function useContributions(goalId: string) {
  const { householdId } = useHousehold();
  return useQuery(
    apiQuery(api, 'financePlus', 'listContributions', { params: { householdId, goalId } }),
  );
}

export function useParties() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'financePlus', 'listParties', { params: { householdId } }));
}

export function useSharedExpenses() {
  const { householdId } = useHousehold();
  return useQuery(
    apiQuery(api, 'financePlus', 'listSharedExpenses', {
      params: { householdId },
      query: { limit: 30 },
    }),
  );
}

export function useBalances() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'financePlus', 'sharedBalances', { params: { householdId } }));
}

export function useSettleUp() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'financePlus', 'settleUpSuggestions', { params: { householdId } }));
}

/** Mutation that refreshes all finance-plus (and finance) queries and reports errors. */
export function useFinancePlusMutation<TVars, TResult>(
  fn: (householdId: string, vars: TVars) => Promise<TResult>,
  onSuccess?: (result: TResult, vars: TVars) => void,
) {
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (vars: TVars) => fn(householdId, vars),
    onSuccess: (result, vars) => {
      onSuccess?.(result, vars);
    },
    onError: (e) => {
      showError(e, t);
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['financePlus'] }),
        queryClient.invalidateQueries({ queryKey: ['finance'] }),
      ]),
  });
}

export function useInsurance() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'financePlus', 'insuranceOverview', { params: { householdId } }));
}

export function useSettlements() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'financePlus', 'listSettlements', { params: { householdId } }));
}

export function useNetWorth(from: string, to: string, enabled = true) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'financePlus', 'netWorth', { params: { householdId }, query: { from, to } }),
    enabled,
  });
}

export function useCategoryTrends(from: string, to: string, enabled = true) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'financePlus', 'categoryTrends', {
      params: { householdId },
      query: { from, to },
    }),
    enabled,
  });
}

export function useYearOverYear(year: number, enabled = true) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'financePlus', 'yearOverYear', { params: { householdId }, query: { year } }),
    enabled,
  });
}

export function useBankConnections(enabled = true) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'financePlus', 'listConnections', { params: { householdId } }),
    enabled,
  });
}

export function useBanks(q: string, enabled = true) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'financePlus', 'listBanks', { params: { householdId }, query: { q } }),
    enabled,
    staleTime: 10 * 60_000,
  });
}
