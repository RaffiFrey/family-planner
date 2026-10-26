'use client';

import { apiQuery } from '@fp/api-client';
import type {
  CreateListBody,
  ItemCategory,
  ListItem,
  ListWithItems,
  UpdateItemBody,
  UpdateListBody,
} from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';

type Detail = z.infer<typeof ListWithItems>;
type Category = z.infer<typeof ItemCategory>;

export function useListMutations() {
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const t = useTranslations('lists');
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['lists'] });

  const create = useMutation({
    mutationFn: (body: z.input<typeof CreateListBody>) =>
      api.lists.create({ params: { householdId }, body }),
    onSuccess: () => toast.success(t('listSaved')),
    onSettled: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ listId, body }: { listId: string; body: z.input<typeof UpdateListBody> }) =>
      api.lists.update({ params: { householdId, listId }, body }),
    onSuccess: () => toast.success(t('listSaved')),
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: (listId: string) => api.lists.remove({ params: { householdId, listId } }),
    onSuccess: () => toast.success(t('listDeleted')),
    onError: toastError,
    onSettled: invalidate,
  });

  return { create, update, remove };
}

/** Item mutations with optimistic cache updates on the list detail query. */
export function useItemMutations(listId: string) {
  const { householdId, member } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const t = useTranslations('lists');
  const { queryKey } = apiQuery(api, 'lists', 'get', { params: { householdId, listId } });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['lists'] });

  const optimistic = async (patch: (items: ListItem[]) => ListItem[]) => {
    await queryClient.cancelQueries({ queryKey });
    const previous = queryClient.getQueryData<Detail>(queryKey);
    queryClient.setQueryData<Detail>(queryKey, (old) =>
      old ? { ...old, items: patch(old.items) } : old,
    );
    return { previous };
  };
  const rollback = (ctx: { previous: Detail | undefined } | undefined) => {
    if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
  };

  const add = useMutation({
    mutationFn: (body: { text: string; quantity: string | null; category?: Category }) =>
      api.lists.addItem({ params: { householdId, listId }, body }),
    onMutate: (body) =>
      optimistic((items) => [
        ...items,
        {
          id: `temp-${crypto.randomUUID()}`,
          listId,
          text: body.text,
          quantity: body.quantity,
          category: body.category ?? 'other',
          checked: false,
          checkedByMemberId: null,
          checkedAt: null,
          position: Math.max(0, ...items.map((i) => i.position)) + 1,
        },
      ]),
    onError: (err, _v, ctx) => {
      rollback(ctx);
      toastError(err);
    },
    onSettled: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: z.input<typeof UpdateItemBody> }) =>
      api.lists.updateItem({ params: { householdId, listId, itemId }, body }),
    onMutate: ({ itemId, body }) =>
      optimistic((items) =>
        items.map((i) =>
          i.id === itemId
            ? {
                ...i,
                ...body,
                ...(body.checked !== undefined
                  ? {
                      checkedByMemberId: body.checked ? member.id : null,
                      checkedAt: body.checked ? new Date().toISOString() : null,
                    }
                  : {}),
              }
            : i,
        ),
      ),
    onError: (err, _v, ctx) => {
      rollback(ctx);
      toastError(err);
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: (itemId: string) =>
      api.lists.removeItem({ params: { householdId, listId, itemId } }),
    onMutate: (itemId) => optimistic((items) => items.filter((i) => i.id !== itemId)),
    onError: (err, _v, ctx) => {
      rollback(ctx);
      toastError(err);
    },
    onSettled: invalidate,
  });

  const clearChecked = useMutation({
    mutationFn: () => api.lists.clearChecked({ params: { householdId, listId } }),
    onMutate: () => optimistic((items) => items.filter((i) => !i.checked)),
    onError: (err, _v, ctx) => {
      rollback(ctx);
      toastError(err);
    },
    onSuccess: ({ removed }) => toast.success(t('clearedCount', { count: removed })),
    onSettled: invalidate,
  });

  return { add, update, remove, clearChecked };
}
