import { apiQuery } from '@fp/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';

export function useAssistantSettings() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'assistant', 'settings', { params: { householdId } }));
}

/** Owner/admin opt-in with explicit consent. */
export function useEnableAssistant() {
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.assistant.enable({ params: { householdId }, body: { consent: true } }),
    onSuccess: (settings) => {
      queryClient.setQueryData(
        apiQuery(api, 'assistant', 'settings', { params: { householdId } }).queryKey,
        settings,
      );
    },
  });
}

/** Everything an applied proposal can create. */
export const APPLIED_MODULES = ['calendar', 'tasks', 'lists', 'finance', 'assistant'] as const;

export function useProposal(proposalId: string) {
  const { householdId } = useHousehold();
  return useQuery(
    apiQuery(api, 'assistant', 'getProposal', { params: { householdId, proposalId } }),
  );
}

/** Owner/admin opt-out: nothing is sent to the AI provider afterwards. */
export function useDisableAssistant() {
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.assistant.disable({ params: { householdId } }),
    onSuccess: (settings) => {
      queryClient.setQueryData(
        apiQuery(api, 'assistant', 'settings', { params: { householdId } }).queryKey,
        settings,
      );
    },
  });
}
