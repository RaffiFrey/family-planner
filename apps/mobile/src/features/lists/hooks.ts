import { apiQuery, type Output } from '@fp/api-client';
import type { ListItem } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { newId } from '@/lib/polyfills';
import type { ItemCategory } from './grouping';

export function useLists() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'lists', 'list', { params: { householdId } }));
}

function listQuery(householdId: string, listId: string) {
  return apiQuery(api, 'lists', 'get', { params: { householdId, listId } });
}

export function useList(listId: string) {
  const { householdId } = useHousehold();
  return useQuery(listQuery(householdId, listId));
}

export function useSuggestions(q: string) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'lists', 'suggestions', { params: { householdId }, query: { q } }),
    staleTime: 5 * 60_000,
  });
}

type ListData = Output<'lists', 'get'>;

/** Mutations on one list with optimistic cache updates; realtime events from others refresh the list. */
export function useListMutations(listId: string) {
  const { householdId, me } = useHousehold();
  const queryClient = useQueryClient();
  const key = listQuery(householdId, listId).queryKey;

  const patchItems = async (fn: (items: ListItem[]) => ListItem[]) => {
    await queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData<ListData>(key);
    if (previous)
      queryClient.setQueryData<ListData>(key, { ...previous, items: fn(previous.items) });
    return { previous };
  };
  const rollback = (
    _e: unknown,
    _v: unknown,
    ctx: { previous: ListData | undefined } | undefined,
  ) => {
    if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
  };
  const settle = () => queryClient.invalidateQueries({ queryKey: ['lists'] });

  const toggle = useMutation({
    mutationFn: (item: ListItem) =>
      api.lists.updateItem({
        params: { householdId, listId, itemId: item.id },
        body: { checked: !item.checked },
      }),
    onMutate: (item) =>
      patchItems((items) =>
        items.map((i) =>
          i.id === item.id
            ? {
                ...i,
                checked: !i.checked,
                checkedAt: i.checked ? null : new Date().toISOString(),
                checkedByMemberId: i.checked ? null : me.id,
              }
            : i,
        ),
      ),
    onError: rollback,
    onSettled: settle,
  });

  const add = useMutation({
    mutationFn: (input: { text: string; category?: ItemCategory }) =>
      api.lists.addItem({ params: { householdId, listId }, body: input }),
    onMutate: (input) =>
      patchItems((items) => [
        ...items,
        {
          id: `tmp-${newId()}`,
          listId,
          text: input.text,
          quantity: null,
          category: input.category ?? 'other',
          checked: false,
          checkedAt: null,
          checkedByMemberId: null,
          position: items.reduce((max, i) => Math.max(max, i.position), 0) + 1,
        },
      ]),
    onError: rollback,
    onSettled: settle,
  });

  const remove = useMutation({
    mutationFn: (item: ListItem) =>
      api.lists.removeItem({ params: { householdId, listId, itemId: item.id } }),
    onMutate: (item) => patchItems((items) => items.filter((i) => i.id !== item.id)),
    onError: rollback,
    onSettled: settle,
  });

  const clearChecked = useMutation({
    mutationFn: () => api.lists.clearChecked({ params: { householdId, listId } }),
    onMutate: () => patchItems((items) => items.filter((i) => !i.checked)),
    onError: rollback,
    onSettled: settle,
  });

  return { toggle, add, remove, clearChecked };
}
