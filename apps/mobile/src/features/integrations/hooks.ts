import { apiQuery } from '@fp/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { showError } from '@/lib/dialogs';

export function useSupportAccess() {
  const { householdId, can } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'households', 'getSupportAccess', { params: { householdId } }),
    enabled: can('household.manage'),
  });
}

export function useSupportAccessMutations() {
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const key = apiQuery(api, 'households', 'getSupportAccess', { params: { householdId } }).queryKey;
  const onSuccess = (data: Awaited<ReturnType<typeof api.households.getSupportAccess>>) => {
    queryClient.setQueryData(key, data);
  };
  const grant = useMutation({
    mutationFn: (input: { hours: number; reason?: string }) =>
      api.households.grantSupportAccess({ params: { householdId }, body: input }),
    onSuccess,
    onError: (e) => {
      showError(e, t);
    },
  });
  const revoke = useMutation({
    mutationFn: () => api.households.revokeSupportAccess({ params: { householdId } }),
    onSuccess,
    onError: (e) => {
      showError(e, t);
    },
  });
  return { grant, revoke };
}

export function useCalendarSubscriptions() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'calendarSync', 'listSubscriptions', { params: { householdId } }));
}

export function useGoogleConnections() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'calendarSync', 'listGoogle', { params: { householdId } }));
}

export function useCalendarSyncMutations() {
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const settle = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['calendarSync'] }),
      queryClient.invalidateQueries({ queryKey: ['calendar'] }),
    ]);
  const onError = (e: unknown) => {
    showError(e, t);
  };
  const create = useMutation({
    mutationFn: (body: { name: string; url: string }) =>
      api.calendarSync.createSubscription({ params: { householdId }, body }),
    onSuccess: settle,
    onError,
  });
  const refresh = useMutation({
    mutationFn: (subscriptionId: string) =>
      api.calendarSync.refreshSubscription({ params: { householdId, subscriptionId } }),
    onSettled: settle,
    onError,
  });
  const remove = useMutation({
    mutationFn: (subscriptionId: string) =>
      api.calendarSync.deleteSubscription({ params: { householdId, subscriptionId } }),
    onSettled: settle,
    onError,
  });
  const syncGoogle = useMutation({
    mutationFn: (connectionId: string) =>
      api.calendarSync.syncGoogle({ params: { householdId, connectionId } }),
    onSettled: settle,
    onError,
  });
  const disconnectGoogle = useMutation({
    mutationFn: (connectionId: string) =>
      api.calendarSync.disconnectGoogle({ params: { householdId, connectionId } }),
    onSettled: settle,
    onError,
  });
  return { create, refresh, remove, syncGoogle, disconnectGoogle };
}
