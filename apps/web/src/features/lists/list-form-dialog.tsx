'use client';

import type { List } from '@fp/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { LIST_KINDS } from './list-kind-icon';
import { useListMutations } from './use-list-mutations';

const VISIBILITIES = ['household', 'private', 'members'] as const;

export function ListFormDialog({
  open,
  onOpenChange,
  list,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: List | null;
}) {
  const t = useTranslations('lists');
  const tc = useTranslations('common');
  const tk = useTranslations('listKinds');
  const tv = useTranslations('visibility');
  const router = useRouter();
  const toastError = useToastError();
  const { create, update } = useListMutations();

  const schema = React.useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('nameRequired')).max(80),
        kind: z.enum(['shopping', 'todo', 'packing', 'wishlist', 'other']),
        visibility: z.enum(VISIBILITIES),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', kind: 'shopping', visibility: 'household' },
  });
  const { register, handleSubmit, reset, setError, formState } = form;

  React.useEffect(() => {
    if (open) {
      reset({
        name: list?.name ?? '',
        kind: list?.kind ?? 'shopping',
        visibility: list?.visibility ?? 'household',
      });
    }
  }, [open, list, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (list) {
        await update.mutateAsync({ listId: list.id, body: values });
        onOpenChange(false);
      } else {
        const created = await create.mutateAsync(values);
        onOpenChange(false);
        router.push(`/lists/${created.id}`);
      }
    } catch (err) {
      if (!applyFieldErrors(err, setError)) toastError(err);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{list ? t('editList') : t('newList')}</DialogTitle>
          <DialogDescription className="sr-only">{t('pageDescription')}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => void onSubmit(e)} noValidate>
          <Field label={t('name')} error={formState.errors.name?.message}>
            {(p) => (
              <Input {...p} {...register('name')} placeholder={t('namePlaceholder')} autoFocus />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('kind')}>
              {(p) => (
                <NativeSelect {...p} {...register('kind')}>
                  {LIST_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {tk(k)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('visibility')}>
              {(p) => (
                <NativeSelect {...p} {...register('visibility')}>
                  {VISIBILITIES.map((v) => (
                    <option key={v} value={v}>
                      {tv(v)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={formState.isSubmitting}>
              {list ? tc('save') : tc('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
