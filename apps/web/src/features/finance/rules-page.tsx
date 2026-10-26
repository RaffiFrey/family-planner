'use client';

import { apiQuery } from '@fp/api-client';
import { RuleCondition } from '@fp/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Plus, Trash2, Wand2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
import { Label } from '@/components/ui/label';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { CategorySelect } from './category-select';
import { type Rule, useCategoryLabel, useCategoryOptions, useInvalidateFinance } from './hooks';
import { MoneyInput } from './money-input';

type Condition = Rule['conditions'][number];
const FIELDS = RuleCondition.shape.field.options;
const OPS = RuleCondition.shape.op.options;

export function RulesPage() {
  const t = useTranslations('finance.rules');
  const tc = useTranslations('common');
  const { householdId, can } = useHousehold();
  const canWrite = can('finance.write');
  const fmt = useFormat();
  const label = useCategoryLabel();
  const { byId } = useCategoryOptions({ includeHidden: true });
  const invalidate = useInvalidateFinance();
  const toastError = useToastError();
  const query = useQuery(apiQuery(api, 'finance', 'listRules', { params: { householdId } }));
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Rule | null>(null);

  const remove = useMutation({
    mutationFn: (r: Rule) => api.finance.deleteRule({ params: { householdId, ruleId: r.id } }),
    onSuccess: async () => {
      setDeleting(null);
      toast.success(t('deleted'));
      await invalidate();
    },
    onError: toastError,
  });

  const describe = (c: Condition) => `${t(`fields.${c.field}`)} ${t(`ops.${c.op}`)} „${c.value}“`;
  const amountRange = (r: Rule) => {
    if (r.amountMinMinor === null && r.amountMaxMinor === null) return null;
    const min = r.amountMinMinor !== null ? fmt.money(r.amountMinMinor) : '';
    const max = r.amountMaxMinor !== null ? fmt.money(r.amountMaxMinor) : '';
    return t('amountRange', { range: `${min} – ${max}` });
  };

  const addButton = canWrite ? (
    <Button onClick={() => setCreateOpen(true)}>
      <Plus aria-hidden />
      {t('add')}
    </Button>
  ) : null;

  return (
    <div>
      <PageHeader title={t('title')} description={t('subtitle')} actions={addButton} />
      {query.isPending ? (
        <LoadingState rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={<Wand2 />}
          title={t('empty')}
          description={t('emptyHint')}
          action={addButton}
        />
      ) : (
        <ul className="grid gap-2">
          {query.data
            .slice()
            .sort((a, b) => a.priority - b.priority)
            .map((r) => (
              <li key={r.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center gap-3 pt-4">
                    <Badge variant="secondary" title={t('priority')}>
                      {r.priority}
                    </Badge>
                    <div className="min-w-0 flex-1 text-sm">
                      <p>{r.conditions.map(describe).join(` ${t('and')} `)}</p>
                      <p className="text-xs text-muted">
                        {[r.direction ? t(`directions.${r.direction}`) : null, amountRange(r)]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <ArrowRight className="size-4 text-muted" aria-hidden />
                      {label(byId.get(r.categoryId))}
                    </span>
                    {canWrite ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={tc('delete')}
                        onClick={() => setDeleting(r)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
        </ul>
      )}
      <RuleDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('deleteTitle')}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

interface FormValues {
  categoryId: string;
  conditions: Condition[];
  direction: '' | 'in' | 'out';
  amountMin: string;
  amountMax: string;
  priority: number;
  applyToExisting: boolean;
}

const DEFAULTS: FormValues = {
  categoryId: '',
  conditions: [{ field: 'counterparty', op: 'contains', value: '' }],
  direction: '',
  amountMin: '',
  amountMax: '',
  priority: 100,
  applyToExisting: true,
};

function RuleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('finance.rules');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const invalidate = useInvalidateFinance();
  const toastError = useToastError();
  const { register, handleSubmit, reset, setError, control, formState } = useForm<FormValues>({
    defaultValues: DEFAULTS,
  });
  const conditions = useFieldArray({ control, name: 'conditions' });
  React.useEffect(() => {
    if (open) reset(DEFAULTS);
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: (body: {
      categoryId: string;
      conditions: Condition[];
      direction: 'in' | 'out' | null;
      amountMinMinor: number | null;
      amountMaxMinor: number | null;
      priority: number;
      applyToExisting: boolean;
    }) => api.finance.createRule({ params: { householdId }, body }),
    onSuccess: async () => {
      toast.success(t('created'));
      onOpenChange(false);
      await invalidate();
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  const onSubmit = handleSubmit((v) => {
    const parseOptional = (
      input: string,
      field: 'amountMin' | 'amountMax',
    ): number | null | undefined => {
      if (!input.trim()) return null;
      try {
        return fmt.parseMoney(input);
      } catch {
        setError(field, { message: tu('invalidAmount') });
        return undefined;
      }
    };
    const amountMinMinor = parseOptional(v.amountMin, 'amountMin');
    const amountMaxMinor = parseOptional(v.amountMax, 'amountMax');
    if (amountMinMinor === undefined || amountMaxMinor === undefined) return;
    mutation.mutate({
      categoryId: v.categoryId,
      conditions: v.conditions.map((c) => ({ ...c, value: c.value.trim() })),
      direction: v.direction || null,
      amountMinMinor,
      amountMaxMinor,
      priority: Number.isFinite(v.priority) ? v.priority : 100,
      applyToExisting: v.applyToExisting,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('add')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t('conditions')}</legend>
            {conditions.fields.map((f, i) => (
              <div key={f.id} className="grid gap-2 sm:grid-cols-[11rem_9rem_1fr_auto]">
                <NativeSelect
                  aria-label={`${t('field')} ${i + 1}`}
                  {...register(`conditions.${i}.field`)}
                >
                  {FIELDS.map((field) => (
                    <option key={field} value={field}>
                      {t(`fields.${field}`)}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  aria-label={`${t('op')} ${i + 1}`}
                  {...register(`conditions.${i}.op`)}
                >
                  {OPS.map((op) => (
                    <option key={op} value={op}>
                      {t(`ops.${op}`)}
                    </option>
                  ))}
                </NativeSelect>
                <Input
                  aria-label={`${t('value')} ${i + 1}`}
                  aria-invalid={Boolean(formState.errors.conditions?.[i]?.value)}
                  placeholder={t('value')}
                  {...register(`conditions.${i}.value`, { required: true, maxLength: 200 })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${t('removeCondition')} ${i + 1}`}
                  disabled={conditions.fields.length === 1}
                  onClick={() => conditions.remove(i)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              size="sm"
              className="w-fit"
              onClick={() => conditions.append({ field: 'purpose', op: 'contains', value: '' })}
            >
              <Plus aria-hidden />
              {t('addCondition')}
            </Button>
          </fieldset>
          <Field label={t('category')} error={formState.errors.categoryId?.message}>
            {(p) => (
              <CategorySelect
                {...p}
                emptyLabel=""
                {...register('categoryId', { required: tu('required') })}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('direction')}>
              {(p) => (
                <NativeSelect {...p} {...register('direction')}>
                  <option value="">{t('directions.any')}</option>
                  <option value="in">{t('directions.in')}</option>
                  <option value="out">{t('directions.out')}</option>
                </NativeSelect>
              )}
            </Field>
            <Field
              label={`${t('amountMin')} (${tc('optional')})`}
              error={formState.errors.amountMin?.message}
            >
              {(p) => <MoneyInput {...p} currency={fmt.currency} {...register('amountMin')} />}
            </Field>
            <Field
              label={`${t('amountMax')} (${tc('optional')})`}
              error={formState.errors.amountMax?.message}
            >
              {(p) => <MoneyInput {...p} currency={fmt.currency} {...register('amountMax')} />}
            </Field>
          </div>
          <Field label={t('priority')} hint={t('priorityHint')} className="sm:max-w-40">
            {(p) => (
              <Input
                {...p}
                type="number"
                min={0}
                {...register('priority', { valueAsNumber: true })}
              />
            )}
          </Field>
          <div className="flex items-start gap-2">
            <Controller
              control={control}
              name="applyToExisting"
              render={({ field }) => (
                <Checkbox
                  id="rule-apply"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
              )}
            />
            <Label htmlFor="rule-apply" className="leading-snug font-normal">
              {t('applyToExisting')}
            </Label>
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
