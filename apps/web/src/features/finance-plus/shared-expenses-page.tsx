'use client';

import { apiQuery, type Output } from '@fp/api-client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  HandCoins,
  MoreVertical,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { todayLocalDate } from '@/features/finance/hooks';
import { MoneyInput } from '@/features/finance/money-input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';
import { localDateInstant, useInvalidateFinancePlus } from './shared';

type Party = Output<'financePlus', 'listParties'>[number];
type Expense = Output<'financePlus', 'listSharedExpenses'>['items'][number];
type SplitMethod = Expense['splitMethod'];
type Suggestion = Output<'financePlus', 'settleUpSuggestions'>[number];

const METHODS: SplitMethod[] = ['equal', 'exact', 'percent', 'shares'];

function useParties() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'financePlus', 'listParties', { params: { householdId } }));
}

export function SharedExpensesPage() {
  const t = useTranslations('financePlus.shared');
  const { can } = useHousehold();
  const canWrite = can('finance.write');
  const parties = useParties();
  const [expenseDialog, setExpenseDialog] = React.useState<{
    open: boolean;
    expense: Expense | null;
  }>({ open: false, expense: null });
  const [settle, setSettle] = React.useState<Partial<Suggestion> | null>(null);

  const partyName = React.useCallback(
    (id: string) => parties.data?.find((p) => p.id === id)?.name ?? '?',
    [parties.data],
  );

  const addButton = canWrite ? (
    <Button onClick={() => setExpenseDialog({ open: true, expense: null })}>
      <Plus aria-hidden />
      {t('addExpense')}
    </Button>
  ) : null;

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <>
            {canWrite ? (
              <Button variant="secondary" onClick={() => setSettle({})}>
                <HandCoins aria-hidden />
                {t('recordSettlement')}
              </Button>
            ) : null}
            {addButton}
          </>
        }
      />
      {parties.isPending ? (
        <LoadingState rows={4} />
      ) : parties.isError ? (
        <ErrorState error={parties.error} onRetry={() => void parties.refetch()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-6">
            <BalancesCard partyName={partyName} canWrite={canWrite} onSettle={setSettle} />
            <ExpensesList
              partyName={partyName}
              canWrite={canWrite}
              addButton={addButton}
              onEdit={(expense) => setExpenseDialog({ open: true, expense })}
            />
            <SettlementsList partyName={partyName} canWrite={canWrite} />
          </div>
          <PartiesCard parties={parties.data} canWrite={canWrite} />
        </div>
      )}
      <ExpenseDialog
        open={expenseDialog.open}
        onOpenChange={(open) => setExpenseDialog((s) => ({ ...s, open }))}
        expense={expenseDialog.expense}
        parties={(parties.data ?? []).filter((p) => !p.archived)}
      />
      <SettlementDialog
        initial={settle}
        onClose={() => setSettle(null)}
        parties={(parties.data ?? []).filter((p) => !p.archived)}
      />
    </div>
  );
}

function BalancesCard({
  partyName,
  canWrite,
  onSettle,
}: {
  partyName: (id: string) => string;
  canWrite: boolean;
  onSettle: (s: Suggestion) => void;
}) {
  const t = useTranslations('financePlus.shared');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const balances = useQuery(
    apiQuery(api, 'financePlus', 'sharedBalances', { params: { householdId } }),
  );
  const suggestions = useQuery(
    apiQuery(api, 'financePlus', 'settleUpSuggestions', { params: { householdId } }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('balances')}</CardTitle>
        <CardDescription>{t('balancesHint')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {balances.isPending ? (
          <LoadingState rows={2} />
        ) : balances.isError ? (
          <ErrorState error={balances.error} onRetry={() => void balances.refetch()} />
        ) : balances.data.every((b) => b.balances.every((x) => x.balanceMinor === 0)) ? (
          <p className="text-sm text-muted">{t('allSettled')}</p>
        ) : (
          balances.data.map((group) => (
            <ul key={group.currency} className="grid gap-1" aria-label={group.currency}>
              {group.balances
                .filter((b) => b.balanceMinor !== 0)
                .sort((a, b) => b.balanceMinor - a.balanceMinor)
                .map((b) => (
                  <li key={b.partyId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{b.name}</span>
                    <span
                      className={cn(
                        'font-medium tabular-nums',
                        b.balanceMinor > 0 ? 'text-success' : 'text-danger',
                      )}
                    >
                      {b.balanceMinor > 0
                        ? t('getsBack', { amount: fmt.money(b.balanceMinor, group.currency) })
                        : t('owes', { amount: fmt.money(-b.balanceMinor, group.currency) })}
                    </span>
                  </li>
                ))}
            </ul>
          ))
        )}
        {suggestions.data && suggestions.data.length > 0 ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t('settleUp')}</h3>
            <ul className="grid gap-2">
              {suggestions.data.map((s) => (
                <li
                  key={`${s.fromPartyId}-${s.toPartyId}-${s.currency}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-muted px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{partyName(s.fromPartyId)}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-muted" aria-label={t('pays')} />
                    <span className="truncate">{partyName(s.toPartyId)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">
                      {fmt.money(s.amountMinor, s.currency)}
                    </span>
                    {canWrite ? (
                      <Button size="sm" variant="secondary" onClick={() => onSettle(s)}>
                        {t('markPaid')}
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ExpensesList({
  partyName,
  canWrite,
  addButton,
  onEdit,
}: {
  partyName: (id: string) => string;
  canWrite: boolean;
  addButton: React.ReactNode;
  onEdit: (e: Expense) => void;
}) {
  const t = useTranslations('financePlus.shared');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const invalidate = useInvalidateFinancePlus();
  const toastError = useToastError();
  const [deleting, setDeleting] = React.useState<Expense | null>(null);
  const query = useInfiniteQuery({
    queryKey: ['financePlus', 'listSharedExpenses', { householdId }],
    queryFn: ({ pageParam }) =>
      api.financePlus.listSharedExpenses({
        params: { householdId },
        query: { limit: 25, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const remove = useMutation({
    mutationFn: (e: Expense) =>
      api.financePlus.deleteSharedExpense({ params: { householdId, expenseId: e.id } }),
    onSuccess: async () => {
      setDeleting(null);
      toast.success(t('expenseDeleted'));
      await invalidate();
    },
    onError: toastError,
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section aria-labelledby="shared-expenses-heading">
      <h2 id="shared-expenses-heading" className="mb-3 text-lg font-semibold">
        {t('expenses')}
      </h2>
      {query.isPending ? (
        <LoadingState rows={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title={t('noExpenses')}
          description={t('noExpensesHint')}
          action={addButton}
        />
      ) : (
        <>
          <ul className="grid gap-2">
            {items.map((e) => (
              <li key={e.id}>
                <Card>
                  <CardContent className="flex items-center gap-3 pt-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{e.title}</p>
                      <p className="text-xs text-muted">
                        {fmt.date(localDateInstant(e.date))} ·{' '}
                        {t('paidBy', { name: partyName(e.paidByPartyId) })} ·{' '}
                        {t(`methods.${e.splitMethod}`)}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {e.shares
                          .map(
                            (s) =>
                              `${partyName(s.partyId)} ${fmt.money(s.amountMinor, e.currency)}`,
                          )
                          .join(' · ')}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">
                      {fmt.money(e.amountMinor, e.currency)}
                    </span>
                    {canWrite ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={tu('actions')}>
                            <MoreVertical aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => onEdit(e)}>
                            <Pencil aria-hidden />
                            {tc('edit')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(e)}>
                            <Trash2 aria-hidden />
                            {tc('delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          {query.hasNextPage ? (
            <div className="mt-3 flex justify-center">
              <Button
                variant="secondary"
                loading={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {tu('loadMore')}
              </Button>
            </div>
          ) : null}
        </>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('deleteExpenseTitle', { title: deleting?.title ?? '' })}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </section>
  );
}

function SettlementsList({
  partyName,
  canWrite,
}: {
  partyName: (id: string) => string;
  canWrite: boolean;
}) {
  const t = useTranslations('financePlus.shared');
  const tc = useTranslations('common');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const invalidate = useInvalidateFinancePlus();
  const toastError = useToastError();
  const query = useQuery(
    apiQuery(api, 'financePlus', 'listSettlements', { params: { householdId } }),
  );
  const remove = useMutation({
    mutationFn: (settlementId: string) =>
      api.financePlus.deleteSettlement({ params: { householdId, settlementId } }),
    onSuccess: () => invalidate(),
    onError: toastError,
  });
  if (!query.data || query.data.length === 0) return null;
  return (
    <section aria-labelledby="settlements-heading">
      <h2 id="settlements-heading" className="mb-3 text-lg font-semibold">
        {t('settlements')}
      </h2>
      <ul className="grid gap-1">
        {query.data.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-muted"
          >
            <span className="w-24 shrink-0 text-xs text-muted">
              {fmt.date(localDateInstant(s.date))}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {t('settlementLine', { from: partyName(s.fromPartyId), to: partyName(s.toPartyId) })}
              {s.note ? <span className="text-muted"> · {s.note}</span> : null}
            </span>
            <span className="font-medium tabular-nums">{fmt.money(s.amountMinor, s.currency)}</span>
            {canWrite ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={tc('delete')}
                onClick={() => remove.mutate(s.id)}
              >
                <Trash2 aria-hidden />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PartiesCard({ parties, canWrite }: { parties: Party[]; canWrite: boolean }) {
  const t = useTranslations('financePlus.shared');
  const tc = useTranslations('common');
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateFinancePlus();
  const toastError = useToastError();
  const [name, setName] = React.useState('');
  const [renaming, setRenaming] = React.useState<Party | null>(null);
  const [renameValue, setRenameValue] = React.useState('');
  const partiesKey = ['financePlus', 'listParties'];

  const create = useMutation({
    mutationFn: (n: string) =>
      api.financePlus.createParty({ params: { householdId }, body: { name: n } }),
    onSuccess: async (party) => {
      queryClient.setQueriesData<Party[]>({ queryKey: partiesKey }, (old) =>
        old ? [...old, party] : old,
      );
      setName('');
      toast.success(t('personAdded', { name: party.name }));
      await invalidate();
    },
    onError: toastError,
  });
  const update = useMutation({
    mutationFn: (v: { id: string; body: { name?: string; archived?: boolean } }) =>
      api.financePlus.updateParty({ params: { householdId, partyId: v.id }, body: v.body }),
    onSuccess: async () => {
      setRenaming(null);
      await invalidate();
    },
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api.financePlus.deleteParty({ params: { householdId, partyId: id } }),
    onSuccess: () => invalidate(),
    onError: toastError,
  });

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4" aria-hidden />
          {t('people')}
        </CardTitle>
        <CardDescription>{t('peopleHint')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ul className="grid gap-1">
          {parties.map((p) => (
            <li
              key={p.id}
              className={cn('flex items-center gap-2 text-sm', p.archived && 'opacity-60')}
            >
              {renaming?.id === p.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (renameValue.trim())
                      update.mutate({ id: p.id, body: { name: renameValue.trim() } });
                  }}
                >
                  <Input
                    aria-label={tc('name')}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                    className="h-8"
                  />
                  <Button size="sm" type="submit" loading={update.isPending}>
                    {tc('save')}
                  </Button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.memberId ? (
                    <Badge variant="secondary">{t('member')}</Badge>
                  ) : (
                    <Badge variant="outline">{t('external')}</Badge>
                  )}
                  {p.archived ? <Badge variant="outline">{t('archived')}</Badge> : null}
                  {canWrite && !p.memberId ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('personActions', { name: p.name })}
                        >
                          <MoreVertical aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setRenaming(p);
                            setRenameValue(p.name);
                          }}
                        >
                          <Pencil aria-hidden />
                          {t('rename')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            update.mutate({ id: p.id, body: { archived: !p.archived } })
                          }
                        >
                          {p.archived ? t('unarchive') : t('archive')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => remove.mutate(p.id)}
                        >
                          <Trash2 aria-hidden />
                          {tc('delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
        {canWrite ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate(name.trim());
            }}
          >
            <Input
              aria-label={t('addPerson')}
              placeholder={t('addPersonPlaceholder')}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              type="submit"
              variant="secondary"
              loading={create.isPending}
              aria-label={t('addPerson')}
            >
              <UserPlus aria-hidden />
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface ShareRow {
  included: boolean;
  value: string;
}

function ExpenseDialog({
  open,
  onOpenChange,
  expense,
  parties,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense | null;
  parties: Party[];
}) {
  const t = useTranslations('financePlus.shared');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{expense ? t('editExpense') : t('addExpense')}</DialogTitle>
          <DialogDescription>{t('expenseHint')}</DialogDescription>
        </DialogHeader>
        {open ? (
          <ExpenseForm
            key={expense?.id ?? 'new'}
            expense={expense}
            parties={parties}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({
  expense,
  parties,
  onDone,
}: {
  expense: Expense | null;
  parties: Party[];
  onDone: () => void;
}) {
  const t = useTranslations('financePlus.shared');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId, member } = useHousehold();
  const invalidate = useInvalidateFinancePlus();
  const toastError = useToastError();
  const currency = expense?.currency ?? fmt.currency;

  const [title, setTitle] = React.useState(expense?.title ?? '');
  const [amount, setAmount] = React.useState(() =>
    expense ? fmt.moneyInput(expense.amountMinor, expense.currency) : '',
  );
  const [date, setDate] = React.useState(expense?.date ?? todayLocalDate());
  const [paidBy, setPaidBy] = React.useState(
    () =>
      expense?.paidByPartyId ??
      parties.find((p) => p.memberId === member.id)?.id ??
      parties[0]?.id ??
      '',
  );
  const [method, setMethod] = React.useState<SplitMethod>(expense?.splitMethod ?? 'equal');
  const [shares, setShares] = React.useState<Record<string, ShareRow>>(() =>
    Object.fromEntries(
      parties.map((p) => {
        if (!expense) return [p.id, { included: true, value: '' }];
        const s = expense.shares.find((x) => x.partyId === p.id);
        const value =
          s?.value == null
            ? ''
            : expense.splitMethod === 'exact'
              ? fmt.moneyInput(s.value, expense.currency)
              : String(s.value);
        return [p.id, { included: Boolean(s), value }];
      }),
    ),
  );
  const [notes, setNotes] = React.useState(expense?.notes ?? '');
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: {
      title: string;
      amountMinor: number;
      date: string;
      paidByPartyId: string;
      splitMethod: SplitMethod;
      shares: { partyId: string; value: number | null }[];
      notes: string | null;
    }) =>
      expense
        ? api.financePlus.updateSharedExpense({
            params: { householdId, expenseId: expense.id },
            body,
          })
        : api.financePlus.createSharedExpense({ params: { householdId }, body }),
    onSuccess: async () => {
      toast.success(t('expenseSaved'));
      onDone();
      await invalidate();
    },
    onError: toastError,
  });

  const included = parties.filter((p) => shares[p.id]?.included);

  const parseShareValue = (raw: string): number | null => {
    if (method === 'equal') return null;
    if (method === 'exact') return fmt.parseMoney(raw || '0', currency);
    const n = Number(raw.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) throw new Error('invalid');
    return method === 'shares' ? Math.round(n) : Math.round(n * 100) / 100;
  };

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError(t('errors.title'));
    let amountMinor: number;
    try {
      amountMinor = fmt.parseMoney(amount, currency);
    } catch {
      return setError(tu('invalidAmount'));
    }
    if (amountMinor <= 0) return setError(tu('invalidAmount'));
    if (!paidBy) return setError(t('errors.paidBy'));
    if (included.length === 0) return setError(t('errors.noParticipants'));
    let values: { partyId: string; value: number | null }[];
    try {
      values = included.map((p) => ({
        partyId: p.id,
        value: parseShareValue(shares[p.id]?.value ?? ''),
      }));
    } catch {
      return setError(t('errors.invalidShare'));
    }
    const sum = values.reduce((s, v) => s + (v.value ?? 0), 0);
    if (method === 'exact' && sum !== amountMinor)
      return setError(
        t('errors.exactSum', {
          amount: fmt.money(amountMinor, currency),
          sum: fmt.money(sum, currency),
        }),
      );
    if (method === 'percent' && Math.abs(sum - 100) > 0.001)
      return setError(t('errors.percentSum', { sum }));
    if (method === 'shares' && sum <= 0) return setError(t('errors.sharesSum'));
    mutation.mutate({
      title: title.trim(),
      amountMinor,
      date,
      paidByPartyId: paidBy,
      splitMethod: method,
      shares: values,
      notes: notes.trim() || null,
    });
  };

  const valueLabel =
    method === 'exact'
      ? t('valueExact')
      : method === 'percent'
        ? t('valuePercent')
        : t('valueShares');

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <Field label={t('expenseTitle')}>
        {(p) => (
          <Input {...p} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('amount')} hint={tu('moneyHint')}>
          {(p) => (
            <MoneyInput
              {...p}
              currency={currency}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('date')}>
          {(p) => (
            <Input type="date" {...p} value={date} onChange={(e) => setDate(e.target.value)} />
          )}
        </Field>
        <Field label={t('paidByLabel')}>
          {(p) => (
            <NativeSelect {...p} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label={t('splitMethod')}>
          {(p) => (
            <NativeSelect
              {...p}
              value={method}
              onChange={(e) => setMethod(e.target.value as SplitMethod)}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`methods.${m}`)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t('participants')}</legend>
        {parties.map((p) => {
          const row = shares[p.id] ?? { included: false, value: '' };
          const id = `share-${p.id}`;
          return (
            <div key={p.id} className="flex items-center gap-3">
              <Checkbox
                id={id}
                checked={row.included}
                onCheckedChange={(v) =>
                  setShares((s) => ({ ...s, [p.id]: { ...row, included: v === true } }))
                }
              />
              <Label htmlFor={id} className="min-w-0 flex-1 truncate font-normal">
                {p.name}
              </Label>
              {method !== 'equal' && row.included ? (
                method === 'exact' ? (
                  <MoneyInput
                    className="w-36"
                    currency={currency}
                    aria-label={`${valueLabel}: ${p.name}`}
                    value={row.value}
                    onChange={(e) =>
                      setShares((s) => ({ ...s, [p.id]: { ...row, value: e.target.value } }))
                    }
                  />
                ) : (
                  <Input
                    className="w-28 text-right tabular-nums"
                    inputMode="decimal"
                    aria-label={`${valueLabel}: ${p.name}`}
                    placeholder={method === 'percent' ? '%' : '1'}
                    value={row.value}
                    onChange={(e) =>
                      setShares((s) => ({ ...s, [p.id]: { ...row, value: e.target.value } }))
                    }
                  />
                )
              ) : null}
            </div>
          );
        })}
      </fieldset>
      <Field label={t('notes')}>
        {(p) => (
          <Textarea rows={2} {...p} value={notes} onChange={(e) => setNotes(e.target.value)} />
        )}
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button variant="secondary" onClick={onDone}>
          {tc('cancel')}
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          {tc('save')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function SettlementDialog({
  initial,
  onClose,
  parties,
}: {
  initial: Partial<Suggestion> | null;
  onClose: () => void;
  parties: Party[];
}) {
  const t = useTranslations('financePlus.shared');
  return (
    <Dialog open={initial !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('recordSettlement')}</DialogTitle>
          <DialogDescription>{t('settlementHint')}</DialogDescription>
        </DialogHeader>
        {initial ? <SettlementForm initial={initial} onClose={onClose} parties={parties} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SettlementForm({
  initial,
  onClose,
  parties,
}: {
  initial: Partial<Suggestion>;
  onClose: () => void;
  parties: Party[];
}) {
  const t = useTranslations('financePlus.shared');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const invalidate = useInvalidateFinancePlus();
  const toastError = useToastError();
  const currency = initial.currency ?? fmt.currency;
  const [from, setFrom] = React.useState(initial.fromPartyId ?? parties[0]?.id ?? '');
  const [to, setTo] = React.useState(initial.toPartyId ?? parties[1]?.id ?? '');
  const [amount, setAmount] = React.useState(() =>
    initial.amountMinor ? fmt.moneyInput(initial.amountMinor, initial.currency) : '',
  );
  const [date, setDate] = React.useState(todayLocalDate());
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (amountMinor: number) =>
      api.financePlus.createSettlement({
        params: { householdId },
        body: {
          fromPartyId: from,
          toPartyId: to,
          amountMinor,
          currency,
          date,
          note: note.trim() || null,
        },
      }),
    onSuccess: async () => {
      toast.success(t('settlementRecorded'));
      onClose();
      await invalidate();
    },
    onError: toastError,
  });

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!from || !to || from === to) return setError(t('errors.sameParty'));
    let amountMinor: number;
    try {
      amountMinor = fmt.parseMoney(amount, currency);
    } catch {
      return setError(tu('invalidAmount'));
    }
    if (amountMinor <= 0) return setError(tu('invalidAmount'));
    mutation.mutate(amountMinor);
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('from')}>
          {(p) => (
            <NativeSelect {...p} value={from} onChange={(e) => setFrom(e.target.value)}>
              {parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label={t('to')}>
          {(p) => (
            <NativeSelect {...p} value={to} onChange={(e) => setTo(e.target.value)}>
              {parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label={t('amount')} hint={tu('moneyHint')}>
          {(p) => (
            <MoneyInput
              {...p}
              currency={currency}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('date')}>
          {(p) => (
            <Input type="date" {...p} value={date} onChange={(e) => setDate(e.target.value)} />
          )}
        </Field>
      </div>
      <Field label={t('note')}>
        {(p) => (
          <Input {...p} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        )}
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          {tc('cancel')}
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          {tc('save')}
        </Button>
      </DialogFooter>
    </form>
  );
}
