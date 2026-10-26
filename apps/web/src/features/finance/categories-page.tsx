'use client';

import type { Category } from '@fp/contracts';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, Pencil, Plus, Tags } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { ColorPicker } from '@/components/color-picker';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { cn, randomPresetColor } from '@/lib/utils';
import {
  type CategoryKind,
  indent,
  useCategories,
  useCategoryOptions,
  useInvalidateFinance,
} from './hooks';

const KINDS: CategoryKind[] = ['expense', 'income', 'transfer'];

export function CategoriesPage() {
  const t = useTranslations('finance.categories');
  const { can } = useHousehold();
  const canWrite = can('finance.write');
  const query = useCategories();
  const { options } = useCategoryOptions({ includeHidden: true });
  const [dialog, setDialog] = React.useState<{ open: boolean; category: Category | null }>({
    open: false,
    category: null,
  });

  return (
    <div>
      <PageHeader
        title={t('title')}
        actions={
          canWrite ? (
            <Button onClick={() => setDialog({ open: true, category: null })}>
              <Plus aria-hidden />
              {t('add')}
            </Button>
          ) : null
        }
      />
      {query.isPending ? (
        <LoadingState rows={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState icon={<Tags />} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {KINDS.map((kind) => {
            const list = options.filter((o) => o.kind === kind);
            if (list.length === 0) return null;
            return (
              <Card key={kind}>
                <CardHeader>
                  <CardTitle>{t(`kinds.${kind}`)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-1">
                    {list.map((o) => (
                      <CategoryRow
                        key={o.id}
                        category={o.category}
                        label={o.label}
                        depth={o.depth}
                        canWrite={canWrite}
                        onEdit={() => setDialog({ open: true, category: o.category })}
                      />
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <CategoryDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        category={dialog.category}
      />
    </div>
  );
}

function CategoryRow({
  category,
  label,
  depth,
  canWrite,
  onEdit,
}: {
  category: Category;
  label: string;
  depth: number;
  canWrite: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations('finance.categories');
  const tc = useTranslations('common');
  const { householdId } = useHousehold();
  const invalidate = useInvalidateFinance();
  const toastError = useToastError();
  const toggle = useMutation({
    mutationFn: () =>
      api.finance.updateCategory({
        params: { householdId, categoryId: category.id },
        body: { hidden: !category.hidden },
      }),
    onSuccess: () => invalidate(),
    onError: toastError,
  });

  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-md py-1 pr-1 hover:bg-surface-muted',
        category.hidden && 'opacity-60',
      )}
      style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
    >
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: category.color ?? 'var(--color-border)' }}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      {category.hidden ? <Badge variant="secondary">{t('hidden')}</Badge> : null}
      {!category.isSystem ? <Badge variant="outline">{t('custom')}</Badge> : null}
      {canWrite ? (
        <>
          {!category.isSystem ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${tc('edit')}: ${label}`}
              onClick={onEdit}
            >
              <Pencil aria-hidden />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${category.hidden ? t('show') : t('hide')}: ${label}`}
            loading={toggle.isPending}
            onClick={() => toggle.mutate()}
          >
            {toggle.isPending ? null : category.hidden ? (
              <Eye aria-hidden />
            ) : (
              <EyeOff aria-hidden />
            )}
          </Button>
        </>
      ) : null}
    </li>
  );
}

interface FormValues {
  name: string;
  kind: CategoryKind;
  parentId: string;
  color: string;
}

function CategoryDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category | null;
}) {
  const t = useTranslations('finance.categories');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const { householdId } = useHousehold();
  const invalidate = useInvalidateFinance();
  const toastError = useToastError();
  const { options } = useCategoryOptions();

  const defaults = React.useCallback(
    (): FormValues => ({
      name: category?.name ?? '',
      kind: category?.kind ?? 'expense',
      parentId: category?.parentId ?? '',
      color: category?.color ?? randomPresetColor(),
    }),
    [category],
  );
  const { register, handleSubmit, reset, setError, control, formState } = useForm<FormValues>({
    defaultValues: defaults(),
  });
  React.useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset, defaults]);

  const kind = useWatch({ control, name: 'kind' });
  // Only one nesting level; a category cannot become its own parent.
  const parents = options.filter((o) => o.kind === kind && o.depth === 0 && o.id !== category?.id);

  const mutation = useMutation({
    mutationFn: (v: FormValues) =>
      category
        ? api.finance.updateCategory({
            params: { householdId, categoryId: category.id },
            body: { name: v.name, parentId: v.parentId || null, color: v.color },
          })
        : api.finance.createCategory({
            params: { householdId },
            body: { name: v.name, kind: v.kind, parentId: v.parentId || null, color: v.color },
          }),
    onSuccess: async () => {
      toast.success(t('saved'));
      onOpenChange(false);
      await invalidate();
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? t('edit') : t('add')}</DialogTitle>
          <DialogDescription className="sr-only">
            {category ? t('edit') : t('add')}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => void handleSubmit((v) => mutation.mutate(v))(e)}
          className="grid gap-4"
          noValidate
        >
          <Field label={t('name')} error={formState.errors.name?.message}>
            {(p) => (
              <Input
                {...p}
                autoFocus
                {...register('name', { required: tu('required'), maxLength: 60 })}
              />
            )}
          </Field>
          <Field label={t('kind')}>
            {(p) => (
              <NativeSelect {...p} disabled={Boolean(category)} {...register('kind')}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kinds.${k}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={t('parent')}>
            {(p) => (
              <NativeSelect {...p} {...register('parentId')}>
                <option value="">{t('noParent')}</option>
                {parents.map((o) => (
                  <option key={o.id} value={o.id}>
                    {indent(o.depth) + o.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{t('color')}</span>
            <Controller
              control={control}
              name="color"
              render={({ field }) => (
                <ColorPicker value={field.value} onChange={field.onChange} label={t('color')} />
              )}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {tc('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
