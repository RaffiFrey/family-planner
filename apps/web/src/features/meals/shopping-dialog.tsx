'use client';

import { apiQuery } from '@fp/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { parseLocalDate } from './utils';

/** "Add week to shopping list": scales, merges and appends the planned ingredients. */
function ShoppingDialogBody({
  open,
  onOpenChange,
  from,
  to,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  from: string;
  to: string;
}) {
  const t = useTranslations('meals.plan');
  const tc = useTranslations('common');
  const fmt = useFormat();
  const router = useRouter();
  const { householdId, can } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const [listId, setListId] = React.useState('');
  const [skipStaples, setSkipStaples] = React.useState(true);
  const id = React.useId();

  const lists = useQuery({
    ...apiQuery(api, 'lists', 'list', { params: { householdId } }),
    enabled: open && can('lists.read'),
  });
  const shoppingLists = (lists.data ?? []).filter((l) => l.kind === 'shopping');

  const run = useMutation({
    mutationFn: () =>
      api.meals.toShoppingList({
        params: { householdId },
        body: { from, to, skipStaples, ...(listId ? { listId } : {}) },
      }),
    onSuccess: async (res) => {
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['lists'] });
      toast.success(t('addedItems', { count: res.items.length }), {
        description:
          res.skipped.length > 0 ? t('skipped', { items: res.skipped.join(', ') }) : undefined,
        action: {
          label: t('openList'),
          onClick: () => router.push(`/lists/${res.listId}`),
        },
      });
    },
    onError: toastError,
  });

  const fmtDay = (s: string) =>
    fmt.date(parseLocalDate(s), { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('toShoppingTitle')}</DialogTitle>
        <DialogDescription>
          {t('toShoppingBody', { from: fmtDay(from), to: fmtDay(to) })}
        </DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
      >
        <Field label={t('targetList')}>
          {(p) => (
            <NativeSelect {...p} value={listId} onChange={(e) => setListId(e.target.value)}>
              <option value="">{t('defaultList')}</option>
              {shoppingLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <div className="flex items-start gap-2">
          <Checkbox
            id={`${id}-staples`}
            checked={skipStaples}
            onCheckedChange={(v) => setSkipStaples(v === true)}
          />
          <Label htmlFor={`${id}-staples`} className="leading-snug font-normal">
            {t('skipStaples')}
          </Label>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button type="submit" loading={run.isPending}>
            {t('add')}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function ShoppingDialog(props: React.ComponentProps<typeof ShoppingDialogBody>) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <ShoppingDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}
