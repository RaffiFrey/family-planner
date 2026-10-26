import { apiQuery } from '@fp/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { showError } from '@/lib/dialogs';

export function useTrips(when: 'upcoming' | 'past' | 'all') {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'travel', 'list', { params: { householdId }, query: { when } }));
}

export function useTrip(tripId: string) {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'travel', 'get', { params: { householdId, tripId } }));
}

export function usePackingTemplates(locale: 'de' | 'en') {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'travel', 'packingTemplates', { params: { householdId }, query: { locale } }),
    staleTime: Infinity,
  });
}

/** Mutation refreshing travel (and lists, for packing lists) and reporting errors. */
export function useTravelMutation<TVars, TResult>(
  fn: (householdId: string, vars: TVars) => Promise<TResult>,
  onSuccess?: (result: TResult) => void,
) {
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (vars: TVars) => fn(householdId, vars),
    onSuccess: (result) => {
      onSuccess?.(result);
    },
    onError: (e) => {
      showError(e, t);
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['travel'] }),
        queryClient.invalidateQueries({ queryKey: ['lists'] }),
      ]),
  });
}

/** Metadata (name, status) of an attached storage file. */
export function useFileMeta(fileId: string) {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'storage', 'getFile', { params: { householdId, fileId } }));
}
