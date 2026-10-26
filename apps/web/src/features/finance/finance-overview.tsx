'use client';

import { apiQuery } from '@fp/api-client';
import type { Account } from '@fp/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Archive, ArchiveRestore, MoreVertical, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';
import { AccountDialog } from './account-dialog';
import { BudgetRow } from './budget-row';
import { useAccounts, useInvalidateFinance } from './hooks';

export function FinanceOverview() {
  const t = useTranslations('finance');
  const { householdId, can } = useHousehold();
  const fmt = useFormat();
  const canWrite = can('finance.write');
  const [showArchived, setShowArchived] = React.useState(false);
  const [editing, setEditing] = React.useState<Account | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const overview = useQuery(apiQuery(api, 'finance', 'overview', { params: { householdId } }));
  const accounts = useAccounts(showArchived);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const monthLabel = overview.data
    ? fmt.date(`${overview.data.month}-15T12:00:00Z`, { month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('title')}
        description={monthLabel ? t('overview.month', { month: monthLabel }) : undefined}
        actions={
          canWrite ? (
            <Button onClick={openCreate}>
              <Plus aria-hidden />
              {t('accounts.add')}
            </Button>
          ) : (
            <Badge variant="secondary">{t('readOnly')}</Badge>
          )
        }
        className="mb-0"
      />

      {overview.isPending ? (
        <LoadingState rows={1} />
      ) : overview.isError ? (
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label={t('overview.netWorth')}
              value={fmt.money(overview.data.netWorthMinor, overview.data.currency)}
            />
            <Stat
              label={t('overview.income')}
              value={fmt.money(overview.data.incomeMinor, overview.data.currency)}
              tone="success"
            />
            <Stat
              label={t('overview.expense')}
              value={fmt.money(Math.abs(overview.data.expenseMinor), overview.data.currency)}
              tone="danger"
            />
          </div>
          {overview.data.uncategorizedCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
              <span>
                {t('overview.uncategorized', { count: overview.data.uncategorizedCount })}
              </span>
              <Button asChild size="sm" variant="secondary">
                <Link href="/finance/transactions?uncategorized=1">{t('overview.review')}</Link>
              </Button>
            </div>
          ) : null}
          {overview.data.budgets.length > 0 ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{t('overview.budgets')}</CardTitle>
                <Link href="/finance/budgets" className="text-sm text-primary hover:underline">
                  {t('nav.budgets')}
                </Link>
              </CardHeader>
              <CardContent className="grid gap-4">
                {overview.data.budgets.map((b) => (
                  <BudgetRow key={b.budget.id} status={b} />
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      <section aria-labelledby="accounts-heading" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="accounts-heading" className="text-lg font-semibold">
            {t('accounts.title')}
          </h2>
          <div className="flex items-center gap-2">
            <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
            <Label htmlFor="show-archived">{t('accounts.showArchived')}</Label>
          </div>
        </div>
        {accounts.isPending ? (
          <LoadingState rows={3} />
        ) : accounts.isError ? (
          <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />
        ) : accounts.data.length === 0 ? (
          <EmptyState
            icon={<Wallet />}
            title={t('accounts.empty')}
            description={t('accounts.emptyHint')}
            action={
              canWrite ? (
                <Button onClick={openCreate}>
                  <Plus aria-hidden />
                  {t('accounts.add')}
                </Button>
              ) : null
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.data.map((a) => (
              <li key={a.id}>
                <AccountCard
                  account={a}
                  canWrite={canWrite}
                  onEdit={() => {
                    setEditing(a);
                    setDialogOpen(true);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <AccountDialog open={dialogOpen} onOpenChange={setDialogOpen} account={editing} />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'danger';
}) {
  return (
    <Card>
      <CardContent className="grid gap-1 pt-4">
        <span className="text-sm text-muted">{label}</span>
        <span
          className={cn(
            'text-2xl font-semibold tabular-nums',
            tone === 'success' && 'text-success',
            tone === 'danger' && 'text-danger',
          )}
        >
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

function AccountCard({
  account,
  canWrite,
  onEdit,
}: {
  account: Account;
  canWrite: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations('finance.accounts');
  const tc = useTranslations('common');
  const tt = useTranslations('accountTypes');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const invalidate = useInvalidateFinance();
  const toastError = useToastError();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const archive = useMutation({
    mutationFn: (archived: boolean) =>
      api.finance.updateAccount({
        params: { householdId, accountId: account.id },
        body: { archived },
      }),
    onSuccess: () => invalidate(),
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: () => api.finance.deleteAccount({ params: { householdId, accountId: account.id } }),
    onSuccess: async () => {
      setConfirmOpen(false);
      toast.success(t('deleted'));
      await invalidate();
    },
    onError: toastError,
  });

  return (
    <Card className={cn('h-full', account.archived && 'opacity-70')}>
      <CardContent className="grid gap-3 pt-4">
        <div className="flex items-start gap-3">
          <span
            className="mt-1 size-3 shrink-0 rounded-full"
            style={{ backgroundColor: account.color ?? 'var(--color-primary)' }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-medium">{account.name}</h3>
            <p className="truncate text-xs text-muted">
              {tt(account.type)}
              {account.institution ? ` · ${account.institution}` : ''}
              {account.ibanLast4 ? ` · ••${account.ibanLast4}` : ''}
            </p>
          </div>
          {canWrite ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={tu('actions')}>
                  <MoreVertical aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil aria-hidden />
                  {tc('edit')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => archive.mutate(!account.archived)}>
                  {account.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                  {account.archived ? t('unarchive') : t('archive')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
                  <Trash2 aria-hidden />
                  {tc('delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        <div className="flex items-end justify-between gap-2">
          <span
            className={cn(
              'text-xl font-semibold tabular-nums',
              account.balanceMinor < 0 && 'text-danger',
            )}
            aria-label={`${t('balance')}: ${fmt.money(account.balanceMinor, account.currency)}`}
          >
            {fmt.money(account.balanceMinor, account.currency)}
          </span>
          <div className="flex gap-1">
            {account.archived ? <Badge variant="secondary">{t('archived')}</Badge> : null}
            {account.source === 'sync' ? <Badge variant="outline">{t('synced')}</Badge> : null}
          </div>
        </div>
        <Link
          href={`/finance/transactions?accountId=${account.id}`}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          {t('transactions')}
        </Link>
      </CardContent>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('deleteTitle')}
        description={t('deleteBody')}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </Card>
  );
}
