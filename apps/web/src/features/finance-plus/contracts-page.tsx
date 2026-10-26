'use client';

import { apiQuery, type Output } from '@fp/api-client';
import type { FinContract } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Check,
  FileSignature,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { EmptyState, LoadingState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UpsellState } from '@/components/upsell';
import { CategorySelect } from '@/features/finance/category-select';
import { useAccounts } from '@/features/finance/hooks';
import { MoneyInput } from '@/features/finance/money-input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useFeature } from '@/lib/entitlements';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { DeadlineBadge, localDateInstant, PlusQueryView, useInvalidateFinancePlus } from './shared';

type ContractType = FinContract['contractType'];
type Interval = FinContract['interval'];
type Suggestion = Output<'financePlus', 'contractSuggestions'>[number];

const TYPES: ContractType[] = ['subscription', 'insurance', 'utility', 'loan', 'other'];
const INTERVALS: Interval[] = ['weekly', 'monthly', 'quarterly', 'halfyearly', 'yearly'];
type TabKey = 'all' | ContractType;
type StatusFilter = 'active' | 'cancelled' | 'all';

export function ContractsPage() {
  const t = useTranslations('financePlus.contracts');
  const { can } = useHousehold();
  const { enabled } = useFeature('contracts');
  const [dialog, setDialog] = React.useState<{ open: boolean; contract: FinContract | null }>({
    open: false,
    contract: null,
  });
  const canWrite = can('finance.write');

  if (enabled === undefined) return <LoadingState rows={4} />;
  if (!enabled) {
    return (
      <div>
        <PageHeader title={t('title')} description={t('description')} />
        <UpsellState feature="contracts" />
      </div>
    );
  }

  const addButton = canWrite ? (
    <Button onClick={() => setDialog({ open: true, contract: null })}>
      <Plus aria-hidden />
      {t('add')}
    </Button>
  ) : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={addButton}
        className="mb-0"
      />
      <SummarySection />
      {canWrite ? <SuggestionsSection /> : null}
      <ContractsList
        canWrite={canWrite}
        onEdit={(contract) => setDialog({ open: true, contract })}
        addButton={addButton}
      />
      <ContractDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        contract={dialog.contract}
      />
    </div>
  );
}

function SummarySection() {
  const t = useTranslations('financePlus.contracts');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const query = useQuery(
    apiQuery(api, 'financePlus', 'contractSummary', { params: { householdId } }),
  );
  return (
    <PlusQueryView query={query} feature="contracts" rows={2}>
      {(s) => (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>{t('summary')}</CardTitle>
              <CardDescription>{t('activeCount', { count: s.activeCount })}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Stat label={t('perMonth')} value={fmt.money(s.monthlyMinor, s.currency)} />
                <Stat label={t('perYear')} value={fmt.money(s.yearlyMinor, s.currency)} />
                {s.monthlyIncomeMinor > 0 ? (
                  <Stat
                    label={t('incomePerMonth')}
                    value={fmt.money(s.monthlyIncomeMinor, s.currency)}
                  />
                ) : null}
              </dl>
              {s.byType.length > 0 ? (
                <table className="w-full text-sm">
                  <caption className="sr-only">{t('byType')}</caption>
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th scope="col" className="py-1 pr-2 font-medium">
                        {t('type')}
                      </th>
                      <th scope="col" className="py-1 pr-2 text-right font-medium">
                        {t('perMonth')}
                      </th>
                      <th scope="col" className="py-1 text-right font-medium">
                        {t('perYear')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {s.byType.map((row) => (
                      <tr key={row.contractType} className="border-t border-border">
                        <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                          {t(`types.${row.contractType}`)}{' '}
                          <span className="text-xs text-muted">({row.count})</span>
                        </th>
                        <td className="py-1.5 pr-2 text-right">
                          {fmt.money(row.monthlyMinor, s.currency)}
                        </td>
                        <td className="py-1.5 text-right">
                          {fmt.money(row.yearlyMinor, s.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('deadlines')}</CardTitle>
              <CardDescription>{t('deadlinesHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              {s.upcomingDeadlines.length === 0 ? (
                <p className="text-sm text-muted">{t('noDeadlines')}</p>
              ) : (
                <ul className="grid gap-2">
                  {s.upcomingDeadlines.map((d) => (
                    <li
                      key={d.contractId}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="min-w-0 truncate">{d.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-muted">
                          {fmt.date(localDateInstant(d.cancellationDeadline))}
                        </span>
                        <DeadlineBadge
                          date={d.cancellationDeadline}
                          label={t('cancellationDeadline')}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PlusQueryView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function SuggestionsSection() {
  const t = useTranslations('financePlus.contracts');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateFinancePlus();
  const toastError = useToastError();
  const queryKey = apiQuery(api, 'financePlus', 'contractSuggestions', { params: { householdId } });
  const query = useQuery(queryKey);

  // Optimistically drop the suggestion from the list; restore on failure.
  const optimisticRemove = async (key: string) => {
    await queryClient.cancelQueries({ queryKey: queryKey.queryKey });
    const previous = queryClient.getQueryData<Suggestion[]>(queryKey.queryKey);
    queryClient.setQueryData<Suggestion[]>(queryKey.queryKey, (old) =>
      old?.filter((s) => s.key !== key),
    );
    return { previous };
  };
  const rollback = (ctx: { previous?: Suggestion[] } | undefined) => {
    if (ctx?.previous) queryClient.setQueryData(queryKey.queryKey, ctx.previous);
  };

  const confirm = useMutation({
    mutationFn: (s: Suggestion) =>
      api.financePlus.confirmSuggestion({
        params: { householdId },
        body: { key: s.key, name: s.name, contractType: s.suggestedType },
      }),
    onMutate: (s) => optimisticRemove(s.key),
    onSuccess: () => toast.success(t('suggestionConfirmed')),
    onError: (err, _s, ctx) => {
      rollback(ctx);
      toastError(err);
    },
    onSettled: () => invalidate(),
  });
  const dismiss = useMutation({
    mutationFn: (s: Suggestion) =>
      api.financePlus.dismissSuggestion({ params: { householdId }, body: { key: s.key } }),
    onMutate: (s) => optimisticRemove(s.key),
    onError: (err, _s, ctx) => {
      rollback(ctx);
      toastError(err);
    },
    onSettled: () => invalidate(),
  });

  if (!query.data || query.data.length === 0) return null;
  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden />
          {t('suggestions')}
        </CardTitle>
        <CardDescription>{t('suggestionsHint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2">
          {query.data.map((s) => (
            <li
              key={s.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{s.name}</p>
                <p className="text-xs text-muted">
                  {t(`intervals.${s.interval}`)} · {t('occurrences', { count: s.occurrences })} ·{' '}
                  {t('nextExpected', { date: fmt.date(localDateInstant(s.nextExpectedDate)) })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold tabular-nums">
                  {fmt.money(s.averageAmountMinor, s.currency)}
                </span>
                <Badge variant="secondary">{t(`types.${s.suggestedType}`)}</Badge>
                <Button
                  size="sm"
                  onClick={() => confirm.mutate(s)}
                  aria-label={t('confirmSuggestion', { name: s.name })}
                >
                  <Check aria-hidden />
                  {t('confirm')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dismiss.mutate(s)}
                  aria-label={t('dismissSuggestion', { name: s.name })}
                >
                  <X aria-hidden />
                  {t('dismiss')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ContractsList({
  canWrite,
  onEdit,
  addButton,
}: {
  canWrite: boolean;
  onEdit: (c: FinContract) => void;
  addButton: React.ReactNode;
}) {
  const t = useTranslations('financePlus.contracts');
  const { householdId } = useHousehold();
  const [tab, setTab] = React.useState<TabKey | 'insurance-overview'>('all');
  const [status, setStatus] = React.useState<StatusFilter>('active');
  const query = useQuery(
    apiQuery(api, 'financePlus', 'listContracts', {
      params: { householdId },
      query: { status, ...(tab !== 'all' && tab !== 'insurance-overview' ? { type: tab } : {}) },
    }),
  );

  return (
    <section aria-labelledby="contracts-list-heading" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="contracts-list-heading" className="text-lg font-semibold">
          {t('listTitle')}
        </h2>
        <label className="flex items-center gap-2 text-sm text-muted">
          {t('statusFilter')}
          <NativeSelect
            className="w-auto"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            <option value="active">{t('status.active')}</option>
            <option value="cancelled">{t('status.cancelled')}</option>
            <option value="all">{t('status.all')}</option>
          </NativeSelect>
        </label>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="max-w-full">
          <TabsTrigger value="all">{t('types.all')}</TabsTrigger>
          {TYPES.map((type) => (
            <TabsTrigger key={type} value={type}>
              {t(`types.${type}`)}
            </TabsTrigger>
          ))}
          <TabsTrigger value="insurance-overview">
            <ShieldCheck aria-hidden />
            {t('insuranceOverview')}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'insurance-overview' ? (
        <InsuranceOverview />
      ) : (
        <PlusQueryView query={query} feature="contracts" rows={4}>
          {(contracts) =>
            contracts.length === 0 ? (
              <EmptyState
                icon={<FileSignature />}
                title={t('empty')}
                description={t('emptyHint')}
                action={addButton}
              />
            ) : (
              <ul className="grid gap-2">
                {contracts.map((c) => (
                  <li key={c.id}>
                    <ContractRow contract={c} canWrite={canWrite} onEdit={onEdit} />
                  </li>
                ))}
              </ul>
            )
          }
        </PlusQueryView>
      )}
    </section>
  );
}

function ContractRow({
  contract: c,
  canWrite,
  onEdit,
}: {
  contract: FinContract;
  canWrite: boolean;
  onEdit: (c: FinContract) => void;
}) {
  const t = useTranslations('financePlus.contracts');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const invalidate = useInvalidateFinancePlus();
  const toastError = useToastError();
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const setStatus = useMutation({
    mutationFn: (status: 'active' | 'cancelled') =>
      api.financePlus.updateContract({
        params: { householdId, contractId: c.id },
        body: { status },
      }),
    onSuccess: async (_d, status) => {
      toast.success(status === 'cancelled' ? t('cancelled') : t('reactivated'));
      await invalidate();
    },
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: () => api.financePlus.deleteContract({ params: { householdId, contractId: c.id } }),
    onSuccess: async () => {
      setConfirmDelete(false);
      toast.success(t('deleted'));
      await invalidate();
    },
    onError: toastError,
  });

  return (
    <Card className={c.status === 'cancelled' ? 'opacity-70' : undefined}>
      <CardContent className="flex flex-wrap items-center gap-3 pt-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{c.name}</p>
            <Badge variant="secondary">{t(`types.${c.contractType}`)}</Badge>
            {c.status === 'cancelled' ? (
              <Badge variant="outline">{t('status.cancelled')}</Badge>
            ) : null}
            {c.source === 'detected' ? <Badge variant="outline">{t('detected')}</Badge> : null}
            {c.status === 'active' && c.cancellationDeadline ? (
              <DeadlineBadge date={c.cancellationDeadline} label={t('cancellationDeadline')} />
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {[
              c.providerName,
              c.nextDueDate
                ? t('nextDue', { date: fmt.date(localDateInstant(c.nextDueDate)) })
                : null,
              c.cancellationDeadline
                ? t('cancelBy', { date: fmt.date(localDateInstant(c.cancellationDeadline)) })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="text-right">
          <p
            className={
              c.direction === 'in'
                ? 'font-semibold text-success tabular-nums'
                : 'font-semibold tabular-nums'
            }
          >
            {fmt.money(c.amountMinor, c.currency)}{' '}
            <span className="text-xs font-normal text-muted">
              / {t(`intervalsShort.${c.interval}`)}
            </span>
          </p>
          {c.interval !== 'monthly' ? (
            <p className="text-xs text-muted tabular-nums">
              {t('monthlyEquivalent', { amount: fmt.money(c.monthlyMinor, c.currency) })}
            </p>
          ) : (
            <p className="text-xs text-muted tabular-nums">
              {t('yearlyEquivalent', { amount: fmt.money(c.yearlyMinor, c.currency) })}
            </p>
          )}
        </div>
        {canWrite ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={tu('actions')}>
                <MoreVertical aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(c)}>
                <Pencil aria-hidden />
                {tc('edit')}
              </DropdownMenuItem>
              {c.status === 'active' ? (
                <DropdownMenuItem onSelect={() => setStatus.mutate('cancelled')}>
                  <Ban aria-hidden />
                  {t('markCancelled')}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => setStatus.mutate('active')}>
                  <RotateCcw aria-hidden />
                  {t('reactivate')}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden />
                {tc('delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </CardContent>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('deleteTitle', { name: c.name })}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </Card>
  );
}

function InsuranceOverview() {
  const t = useTranslations('financePlus.contracts');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const query = useQuery(
    apiQuery(api, 'financePlus', 'insuranceOverview', { params: { householdId } }),
  );
  return (
    <PlusQueryView query={query} feature="contracts" rows={3}>
      {(o) =>
        o.contracts.length === 0 ? (
          <EmptyState icon={<ShieldCheck />} title={t('noInsurance')} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t('insuranceOverview')}</CardTitle>
              <CardDescription>
                {t('insuranceTotals', {
                  monthly: fmt.money(o.monthlyMinor, o.currency),
                  yearly: fmt.money(o.yearlyMinor, o.currency),
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('insuranceOverview')}</caption>
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="py-1 pr-2 font-medium">
                      {t('name')}
                    </th>
                    <th scope="col" className="py-1 pr-2 font-medium">
                      {t('provider')}
                    </th>
                    <th scope="col" className="py-1 pr-2 font-medium">
                      {t('contractNumber')}
                    </th>
                    <th scope="col" className="py-1 pr-2 text-right font-medium">
                      {t('perYear')}
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      {t('cancellationDeadline')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {o.contracts.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                        {c.name}
                      </th>
                      <td className="py-1.5 pr-2">{c.providerName ?? '–'}</td>
                      <td className="py-1.5 pr-2">{c.contractNumber ?? '–'}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {fmt.money(c.yearlyMinor, c.currency)}
                      </td>
                      <td className="py-1.5 text-right">
                        {c.cancellationDeadline
                          ? fmt.date(localDateInstant(c.cancellationDeadline))
                          : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )
      }
    </PlusQueryView>
  );
}

interface FormValues {
  name: string;
  contractType: ContractType;
  direction: 'in' | 'out';
  amount: string;
  interval: Interval;
  nextDueDate: string;
  startDate: string;
  minimumTermEnd: string;
  noticePeriodDays: string;
  providerName: string;
  contractNumber: string;
  counterpartyName: string;
  categoryId: string;
  accountId: string;
  notes: string;
}

function ContractDialog({
  open,
  onOpenChange,
  contract,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: FinContract | null;
}) {
  const t = useTranslations('financePlus.contracts');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const invalidate = useInvalidateFinancePlus();
  const toastError = useToastError();
  const accounts = useAccounts();

  const defaults = React.useCallback(
    (): FormValues => ({
      name: contract?.name ?? '',
      contractType: contract?.contractType ?? 'subscription',
      direction: contract?.direction ?? 'out',
      amount: contract ? fmt.moneyInput(contract.amountMinor, contract.currency) : '',
      interval: contract?.interval ?? 'monthly',
      nextDueDate: contract?.nextDueDate ?? '',
      startDate: contract?.startDate ?? '',
      minimumTermEnd: contract?.minimumTermEnd ?? '',
      noticePeriodDays: contract?.noticePeriodDays?.toString() ?? '',
      providerName: contract?.providerName ?? '',
      contractNumber: contract?.contractNumber ?? '',
      counterpartyName: contract?.counterpartyName ?? '',
      categoryId: contract?.categoryId ?? '',
      accountId: contract?.accountId ?? '',
      notes: contract?.notes ?? '',
    }),
    [contract, fmt],
  );
  const { register, handleSubmit, reset, setError, formState } = useForm<FormValues>({
    defaultValues: defaults(),
  });
  React.useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset, defaults]);

  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof api.financePlus.createContract>[0]['body']) =>
      contract
        ? api.financePlus.updateContract({
            params: { householdId, contractId: contract.id },
            body,
          })
        : api.financePlus.createContract({ params: { householdId }, body }),
    onSuccess: async () => {
      toast.success(t('saved'));
      onOpenChange(false);
      await invalidate();
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  const onSubmit = handleSubmit((v) => {
    let amountMinor: number;
    try {
      amountMinor = fmt.parseMoney(v.amount, contract?.currency);
    } catch {
      setError('amount', { message: tu('invalidAmount') });
      return;
    }
    if (amountMinor <= 0) {
      setError('amount', { message: tu('invalidAmount') });
      return;
    }
    const orNull = (s: string) => (s.trim() === '' ? null : s.trim());
    mutation.mutate({
      name: v.name.trim(),
      contractType: v.contractType,
      direction: v.direction,
      amountMinor,
      interval: v.interval,
      nextDueDate: orNull(v.nextDueDate),
      startDate: orNull(v.startDate),
      minimumTermEnd: orNull(v.minimumTermEnd),
      noticePeriodDays: v.noticePeriodDays.trim() === '' ? null : Number(v.noticePeriodDays),
      providerName: orNull(v.providerName),
      contractNumber: orNull(v.contractNumber),
      counterpartyName: orNull(v.counterpartyName),
      categoryId: orNull(v.categoryId),
      accountId: orNull(v.accountId),
      notes: orNull(v.notes),
    });
  });

  const errors = formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{contract ? t('edit') : t('add')}</DialogTitle>
          <DialogDescription>{t('formHint')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('name')} error={errors.name?.message} className="sm:col-span-2">
              {(p) => <Input {...p} {...register('name', { required: tu('required') })} />}
            </Field>
            <Field label={t('type')}>
              {(p) => (
                <NativeSelect {...p} {...register('contractType')}>
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`types.${type}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('direction')}>
              {(p) => (
                <NativeSelect {...p} {...register('direction')}>
                  <option value="out">{t('directions.out')}</option>
                  <option value="in">{t('directions.in')}</option>
                </NativeSelect>
              )}
            </Field>
            <Field label={t('amount')} hint={tu('moneyHint')} error={errors.amount?.message}>
              {(p) => (
                <MoneyInput
                  {...p}
                  currency={contract?.currency ?? fmt.currency}
                  {...register('amount', { required: tu('required') })}
                />
              )}
            </Field>
            <Field label={t('interval')}>
              {(p) => (
                <NativeSelect {...p} {...register('interval')}>
                  {INTERVALS.map((i) => (
                    <option key={i} value={i}>
                      {t(`intervals.${i}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('startDate')}>
              {(p) => <Input type="date" {...p} {...register('startDate')} />}
            </Field>
            <Field label={t('nextDueDate')}>
              {(p) => <Input type="date" {...p} {...register('nextDueDate')} />}
            </Field>
            <Field label={t('minimumTermEnd')}>
              {(p) => <Input type="date" {...p} {...register('minimumTermEnd')} />}
            </Field>
            <Field
              label={t('noticePeriodDays')}
              hint={t('noticePeriodHint')}
              error={errors.noticePeriodDays?.message}
            >
              {(p) => (
                <Input
                  type="number"
                  min={0}
                  max={3650}
                  inputMode="numeric"
                  {...p}
                  {...register('noticePeriodDays', {
                    validate: (v) =>
                      v === '' || (Number.isInteger(Number(v)) && Number(v) >= 0) || tu('required'),
                  })}
                />
              )}
            </Field>
            <Field label={t('provider')}>
              {(p) => <Input {...p} {...register('providerName')} />}
            </Field>
            <Field label={t('contractNumber')}>
              {(p) => <Input {...p} {...register('contractNumber')} />}
            </Field>
            <Field label={t('counterparty')} hint={t('counterpartyHint')}>
              {(p) => <Input {...p} {...register('counterpartyName')} />}
            </Field>
            <Field label={t('category')}>
              {(p) => (
                <CategorySelect
                  {...p}
                  emptyLabel={tc('none')}
                  includeId={contract?.categoryId}
                  {...register('categoryId')}
                />
              )}
            </Field>
            <Field label={t('account')}>
              {(p) => (
                <NativeSelect {...p} {...register('accountId')}>
                  <option value="">{tc('none')}</option>
                  {(accounts.data ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('notes')} className="sm:col-span-2">
              {(p) => <Textarea rows={2} {...p} {...register('notes')} />}
            </Field>
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
