'use client';

import type { Transaction } from '@fp/contracts';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import {
  ArrowLeftRight,
  MoreVertical,
  Pencil,
  Plus,
  Receipt,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';
import { CategorySelect } from './category-select';
import {
  accountById,
  useAccounts,
  useCategoryLabel,
  useCategoryOptions,
  useInvalidateFinance,
} from './hooks';
import { TransactionDialog } from './transaction-dialog';

interface Filters {
  accountId: string;
  categoryId: string;
  uncategorized: boolean;
  from: string;
  to: string;
  q: string;
}

const PAGE_SIZE = 50;
const features = tableFeatures({});
const helper = createColumnHelper<typeof features, Transaction>();
const EMPTY: Transaction[] = [];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Inline category select; after a change, offers to remember it as a rule for the counterparty. */
function InlineCategory({ tx, disabled }: { tx: Transaction; disabled: boolean }) {
  const t = useTranslations('finance.transactions');
  const { householdId } = useHousehold();
  const invalidate = useInvalidateFinance();
  const toastError = useToastError();
  const mutation = useMutation({
    mutationFn: (vars: { categoryId: string | null; createRule: boolean }) =>
      api.finance.updateTransaction({
        params: { householdId, transactionId: tx.id },
        body: { categoryId: vars.categoryId, createRule: vars.createRule },
      }),
    onSuccess: async (_data, vars) => {
      await invalidate();
      if (vars.createRule) {
        toast.success(t('ruleCreated'));
        return;
      }
      const name = tx.counterpartyName;
      if (vars.categoryId && name) {
        toast.success(t('categoryChanged'), {
          description: t('createRuleFor', { name }),
          action: {
            label: t('createRule'),
            onClick: () => mutation.mutate({ categoryId: vars.categoryId, createRule: true }),
          },
          duration: 8000,
        });
      } else {
        toast.success(t('categoryChanged'));
      }
    },
    onError: toastError,
  });
  if (tx.transferAccountId) return null;
  const kind = tx.amountMinor >= 0 ? 'income' : 'expense';
  return (
    <CategorySelect
      aria-label={t('changeCategory', { name: tx.counterpartyName ?? tx.purpose })}
      className={cn('h-8 min-w-40 py-1 text-xs', !tx.categoryId && 'text-muted')}
      kind={kind}
      includeId={tx.categoryId}
      emptyLabel={t('uncategorized')}
      value={tx.categoryId ?? ''}
      disabled={disabled || mutation.isPending}
      onChange={(e) => mutation.mutate({ categoryId: e.target.value || null, createRule: false })}
    />
  );
}

export function TransactionsPage() {
  const t = useTranslations('finance.transactions');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const searchParams = useSearchParams();
  const fmt = useFormat();
  const { householdId, can } = useHousehold();
  const canWrite = can('finance.write');
  const accounts = useAccounts(true);
  const categoryLabel = useCategoryLabel();
  const { byId: categoriesById } = useCategoryOptions({ includeHidden: true });
  const invalidate = useInvalidateFinance();
  const toastError = useToastError();

  const initialFilters = React.useMemo<Filters>(
    () => ({
      accountId: searchParams.get('accountId') ?? '',
      categoryId: searchParams.get('categoryId') ?? '',
      uncategorized: searchParams.get('uncategorized') === '1',
      from: '',
      to: '',
      q: '',
    }),
    [searchParams],
  );
  const [filters, setFilters] = React.useState<Filters>(initialFilters);
  const q = useDebounced(filters.q.trim(), 300);
  const [dialog, setDialog] = React.useState<{ open: boolean; tx: Transaction | null }>({
    open: false,
    tx: null,
  });
  const [deleting, setDeleting] = React.useState<Transaction | null>(null);

  const query = {
    limit: PAGE_SIZE,
    accountId: filters.accountId || undefined,
    categoryId: filters.uncategorized ? undefined : filters.categoryId || undefined,
    uncategorized: filters.uncategorized ? 'true' : undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    q: q || undefined,
  };

  const list = useInfiniteQuery({
    queryKey: ['finance', 'listTransactions', { params: { householdId }, query }],
    queryFn: ({ pageParam }) =>
      api.finance.listTransactions({
        params: { householdId },
        query: { ...query, cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const rows = React.useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? EMPTY, [list.data]);

  const remove = useMutation({
    mutationFn: (tx: Transaction) =>
      api.finance.deleteTransaction({ params: { householdId, transactionId: tx.id } }),
    onSuccess: async () => {
      setDeleting(null);
      toast.success(t('deleted'));
      await invalidate();
    },
    onError: toastError,
  });

  const columns = React.useMemo(
    () =>
      helper.columns([
        helper.accessor('bookingDate', {
          header: t('date'),
          cell: (info) => (
            <span className="whitespace-nowrap tabular-nums">
              {fmt.date(`${info.getValue()}T12:00:00Z`, { dateStyle: 'medium' })}
            </span>
          ),
        }),
        helper.display({
          id: 'description',
          header: t('counterparty'),
          cell: ({ row }) => {
            const tx = row.original;
            return (
              <div className="min-w-48 max-w-md">
                <div className="flex items-center gap-1.5 font-medium">
                  {tx.transferAccountId ? (
                    <ArrowLeftRight className="size-3.5 text-muted" aria-label={t('transfer')} />
                  ) : null}
                  <span className="truncate">{tx.counterpartyName ?? (tx.purpose || '–')}</span>
                  {tx.status === 'pending' ? <Badge variant="warning">{t('pending')}</Badge> : null}
                </div>
                {tx.counterpartyName && tx.purpose ? (
                  <div className="truncate text-xs text-muted">{tx.purpose}</div>
                ) : null}
                {tx.tags.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {tx.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          },
        }),
        helper.accessor('accountId', {
          header: t('account'),
          cell: (info) => {
            const acc = accountById(accounts.data, info.getValue());
            const target = accountById(accounts.data, info.row.original.transferAccountId);
            return (
              <span className="whitespace-nowrap text-muted">
                {acc?.name ?? '–'}
                {target ? ` → ${target.name}` : ''}
              </span>
            );
          },
        }),
        helper.display({
          id: 'category',
          header: t('category'),
          cell: ({ row }) => {
            const tx = row.original;
            if (tx.splits.length > 0) {
              return (
                <span className="text-xs text-muted">
                  {tx.splits
                    .map((s) =>
                      categoryLabel(s.categoryId ? categoriesById.get(s.categoryId) : null),
                    )
                    .join(', ')}
                </span>
              );
            }
            return (
              <div className="flex items-center gap-1.5">
                <InlineCategory tx={tx} disabled={!canWrite} />
                {tx.ruleId ? (
                  <Badge variant="outline" title={t('byRule')}>
                    {t('byRule')}
                  </Badge>
                ) : null}
              </div>
            );
          },
        }),
        helper.accessor('amountMinor', {
          header: () => <span className="block text-right">{t('amount')}</span>,
          cell: (info) => (
            <span
              className={cn(
                'block text-right font-medium whitespace-nowrap tabular-nums',
                info.getValue() >= 0 ? 'text-success' : 'text-foreground',
              )}
            >
              {fmt.money(info.getValue(), info.row.original.currency)}
            </span>
          ),
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">{tu('actions')}</span>,
          cell: ({ row }) =>
            canWrite ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('actionsFor', {
                      name: row.original.counterpartyName ?? row.original.purpose,
                    })}
                  >
                    <MoreVertical aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDialog({ open: true, tx: row.original })}>
                    <Pencil aria-hidden />
                    {tc('edit')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setDeleting(row.original)}
                  >
                    <Trash2 aria-hidden />
                    {tc('delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null,
        }),
      ]),
    [t, tc, tu, fmt, accounts.data, categoryLabel, categoriesById, canWrite],
  );

  const table = useTable({ features, columns, data: rows });

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const filtersActive =
    filters.accountId !== '' ||
    filters.categoryId !== '' ||
    filters.uncategorized ||
    filters.from !== '' ||
    filters.to !== '' ||
    filters.q !== '';

  return (
    <div className="grid gap-4">
      <PageHeader
        title={t('title')}
        className="mb-0"
        actions={
          canWrite ? (
            <Button
              onClick={() => setDialog({ open: true, tx: null })}
              disabled={accounts.data?.length === 0}
            >
              <Plus aria-hidden />
              {t('add')}
            </Button>
          ) : null
        }
      />

      <section
        aria-label={t('filters')}
        className="grid gap-3 rounded-lg border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-6"
      >
        <div className="relative lg:col-span-2">
          <Label htmlFor="tx-search" className="sr-only">
            {t('search')}
          </Label>
          <Search
            className="pointer-events-none absolute top-3 left-3 size-4 text-muted"
            aria-hidden
          />
          <Input
            id="tx-search"
            type="search"
            placeholder={t('searchPlaceholder')}
            className="pl-9"
            value={filters.q}
            onChange={(e) => set('q', e.target.value)}
          />
        </div>
        <NativeSelect
          aria-label={t('account')}
          value={filters.accountId}
          onChange={(e) => set('accountId', e.target.value)}
        >
          <option value="">{t('allAccounts')}</option>
          {(accounts.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
        <CategorySelect
          aria-label={t('category')}
          emptyLabel={t('allCategories')}
          value={filters.categoryId}
          disabled={filters.uncategorized}
          onChange={(e) => set('categoryId', e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Label htmlFor="tx-from" className="shrink-0 text-xs text-muted">
            {t('from')}
          </Label>
          <Input
            id="tx-from"
            type="date"
            value={filters.from}
            onChange={(e) => set('from', e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="tx-to" className="shrink-0 text-xs text-muted">
            {t('to')}
          </Label>
          <Input
            id="tx-to"
            type="date"
            value={filters.to}
            onChange={(e) => set('to', e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2 lg:col-span-6">
          <div className="flex items-center gap-2">
            <Checkbox
              id="tx-uncategorized"
              checked={filters.uncategorized}
              onCheckedChange={(v) => set('uncategorized', v === true)}
            />
            <Label htmlFor="tx-uncategorized">{t('onlyUncategorized')}</Label>
          </div>
          {filtersActive ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setFilters({
                  accountId: '',
                  categoryId: '',
                  uncategorized: false,
                  from: '',
                  to: '',
                  q: '',
                })
              }
            >
              <X aria-hidden />
              {t('resetFilters')}
            </Button>
          ) : null}
        </div>
      </section>

      {list.isPending ? (
        <LoadingState rows={8} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title={t('empty')}
          description={accounts.data?.length === 0 ? t('noAccounts') : undefined}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{t('title')}</caption>
              <thead className="bg-surface-muted text-left text-xs text-muted uppercase">
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => (
                      <th key={header.id} scope="col" className="px-3 py-2 font-medium">
                        {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-t border-border align-top hover:bg-surface">
                    {row.getAllCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2">
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted" aria-live="polite">
              {t('loaded', { count: rows.length })}
            </span>
            {list.hasNextPage ? (
              <Button
                variant="secondary"
                loading={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {tu('loadMore')}
              </Button>
            ) : null}
          </div>
        </>
      )}

      <TransactionDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        transaction={dialog.tx}
        defaultAccountId={filters.accountId || undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('deleteTitle')}
        description={deleting?.transferAccountId ? t('deleteBody') : undefined}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}
