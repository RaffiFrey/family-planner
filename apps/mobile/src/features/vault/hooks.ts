import { apiQuery, type Input } from '@fp/api-client';
import type { VaultDocument } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';

export function useVaultDocuments() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'vault', 'list', { params: { householdId } }));
}

export function useVaultSearch(q: string) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'vault', 'search', { params: { householdId }, query: { q } }),
    enabled: q.length > 0,
  });
}

export function useVaultDocument(documentId: string | undefined) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'vault', 'get', {
      params: { householdId, documentId: documentId ?? '' },
    }),
    enabled: !!documentId,
    // Contains the decrypted document number: keep it out of the long-lived offline cache.
    gcTime: 5 * 60_000,
  });
}

export type CreateVaultBody = Input<'vault', 'create'>['body'];
export type UpdateVaultBody = Input<'vault', 'update'>['body'];

/** Writes to one household's vault; every change refreshes all vault queries. */
export function useVaultMutations() {
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const settle = () => queryClient.invalidateQueries({ queryKey: ['vault'] });

  const create = useMutation({
    mutationFn: (body: CreateVaultBody) => api.vault.create({ params: { householdId }, body }),
    onSettled: settle,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateVaultBody }) =>
      api.vault.update({ params: { householdId, documentId: id }, body }),
    onSuccess: (doc) => {
      queryClient.setQueryData(
        apiQuery(api, 'vault', 'get', { params: { householdId, documentId: doc.id } }).queryKey,
        doc,
      );
    },
    onSettled: settle,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.vault.remove({ params: { householdId, documentId: id } }),
    onSettled: settle,
  });
  const runOcr = useMutation({
    mutationFn: (id: string) => api.vault.runOcr({ params: { householdId, documentId: id } }),
    onSuccess: (doc: VaultDocument) => {
      queryClient.setQueryData(
        apiQuery(api, 'vault', 'get', { params: { householdId, documentId: doc.id } }).queryKey,
        doc,
      );
    },
    onSettled: settle,
  });
  return { create, update, remove, runOcr };
}

/** Documents expiring within `days` (including already expired ones). */
export function useVaultExpiring(days: number) {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'vault', 'expiring', { params: { householdId }, query: { days } }));
}
