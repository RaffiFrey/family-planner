'use client';

import { apiQuery, type Output } from '@fp/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Landmark,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
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
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { UpsellState } from '@/components/upsell';
import { useAccounts } from '@/features/finance/hooks';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import { useFeature } from '@/lib/entitlements';
import { isPlanLimit, useErrorMessage, useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { useInvalidateFinancePlus } from './shared';

type Connection = Output<'financePlus', 'listConnections'>[number];
type BankAccount = Connection['accounts'][number];

const PENDING_KEY = 'fp.bankSync.pendingConnection';

export function BankSyncPage() {
  const t = useTranslations('financePlus.bankSync');
  const { can } = useHousehold();
  const { enabled } = useFeature('bank_sync');
  const [connectOpen, setConnectOpen] = React.useState(false);
  const canWrite = can('finance.write');

  if (enabled === undefined) return <LoadingState rows={3} />;
  if (!enabled) {
    return (
      <div>
        <PageHeader title={t('title')} description={t('description')} />
        <UpsellState feature="bank_sync" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canWrite ? (
            <Button onClick={() => setConnectOpen(true)}>
              <Plus aria-hidden />
              {t('connect')}
            </Button>
          ) : null
        }
      />
      <ReturnHandler />
      <ConnectionsList canWrite={canWrite} onConnect={() => setConnectOpen(true)} />
      <p className="mt-6 text-xs text-muted">{t('privacy')}</p>
      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  );
}

/**
 * Return page after the bank login: `?connection=<id>&status=<status>` (sent by the API callback).
 * Pending connections are finished via the complete endpoint; the URL is cleaned afterwards.
 */
function ReturnHandler() {
  const t = useTranslations('financePlus.bankSync');
  const params = useSearchParams();
  const router = useRouter();
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const connectionId = params.get('connection');
  const status = params.get('status');
  const started = React.useRef<string | null>(null);
  const [result, setResult] = React.useState<
    { kind: 'ok'; bankName: string } | { kind: 'error'; message: string } | null
  >(null);

  React.useEffect(() => {
    if (!connectionId || started.current === connectionId) return;
    started.current = connectionId;
    void (async () => {
      try {
        const conn = await api.financePlus.completeConnection({
          params: { householdId, connectionId },
        });
        if (conn.status === 'active') setResult({ kind: 'ok', bankName: conn.bankName });
        else setResult({ kind: 'error', message: conn.lastError ?? t(`status.${conn.status}`) });
      } catch (err) {
        setResult({ kind: 'error', message: errorMessage(err) });
      } finally {
        try {
          sessionStorage.removeItem(PENDING_KEY);
        } catch {
          // storage may be unavailable
        }
        await queryClient.invalidateQueries({ queryKey: ['financePlus'] });
        router.replace('/finance/bank-sync');
      }
    })();
  }, [connectionId, status, householdId, queryClient, router, t, errorMessage]);

  if (connectionId && !result) {
    return (
      <Card className="mb-4" role="status">
        <CardContent className="flex items-center gap-3 pt-4 text-sm">
          <RefreshCw className="size-4 animate-spin" aria-hidden />
          {t('completing')}
        </CardContent>
      </Card>
    );
  }
  if (!result) return null;
  return (
    <Card
      className={result.kind === 'ok' ? 'mb-4 border-success/40' : 'mb-4 border-danger/40'}
      role="status"
    >
      <CardContent className="flex items-start gap-3 pt-4 text-sm">
        {result.kind === 'ok' ? (
          <>
            <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
            <div>
              <p className="font-medium">{t('connected', { bank: result.bankName })}</p>
              <p className="text-muted">{t('connectedHint')}</p>
            </div>
          </>
        ) : (
          <>
            <AlertTriangle className="size-5 shrink-0 text-danger" aria-hidden />
            <div>
              <p className="font-medium">{t('connectFailed')}</p>
              <p className="text-muted">{result.message}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ConnectionsList({ canWrite, onConnect }: { canWrite: boolean; onConnect: () => void }) {
  const t = useTranslations('financePlus.bankSync');
  const { householdId } = useHousehold();
  const query = useQuery(
    apiQuery(api, 'financePlus', 'listConnections', { params: { householdId } }),
  );
  if (query.isPending) return <LoadingState rows={3} />;
  if (query.isError) {
    if (isPlanLimit(query.error)) return <UpsellState feature="bank_sync" />;
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  if (query.data.length === 0) {
    return (
      <EmptyState
        icon={<Landmark />}
        title={t('empty')}
        description={t('emptyHint')}
        action={
          canWrite ? (
            <Button onClick={onConnect}>
              <Plus aria-hidden />
              {t('connect')}
            </Button>
          ) : null
        }
      />
    );
  }
  return (
    <ul className="grid gap-4">
      {query.data.map((c) => (
        <li key={c.id}>
          <ConnectionCard connection={c} canWrite={canWrite} />
        </li>
      ))}
    </ul>
  );
}

const STATUS_VARIANT = {
  active: 'success',
  pending: 'warning',
  error: 'danger',
  expired: 'danger',
} as const;

function ConnectionCard({
  connection: c,
  canWrite,
}: {
  connection: Connection;
  canWrite: boolean;
}) {
  const t = useTranslations('financePlus.bankSync');
  const tc = useTranslations('common');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const invalidate = useInvalidateFinancePlus(true);
  const toastError = useToastError();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [linking, setLinking] = React.useState<BankAccount | null>(null);

  const sync = useMutation({
    mutationFn: () =>
      api.financePlus.syncConnection({ params: { householdId, connectionId: c.id } }),
    onSuccess: async (r) => {
      if (r.status === 'active')
        toast.success(t('synced', { imported: r.imported, duplicates: r.duplicates }));
      else toast.error(t(`status.${r.status}`));
      await invalidate();
    },
    onError: async (err) => {
      toastError(err);
      await invalidate();
    },
  });
  const complete = useMutation({
    mutationFn: () =>
      api.financePlus.completeConnection({ params: { householdId, connectionId: c.id } }),
    onSuccess: () => invalidate(),
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: () =>
      api.financePlus.deleteConnection({ params: { householdId, connectionId: c.id } }),
    onSuccess: async () => {
      setConfirmDelete(false);
      toast.success(t('removed'));
      await invalidate();
    },
    onError: toastError,
  });

  const linked = c.accounts.some((a) => a.accountId);
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-muted"
            aria-hidden
          >
            <Building2 className="size-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="truncate">{c.bankName}</CardTitle>
            <CardDescription>
              {c.lastSyncedAt
                ? t('lastSynced', { date: fmt.dateTime(c.lastSyncedAt) })
                : t('neverSynced')}
              {c.consentExpiresAt
                ? ` · ${t('consentUntil', { date: fmt.date(c.consentExpiresAt) })}`
                : ''}
            </CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_VARIANT[c.status]}>{t(`status.${c.status}`)}</Badge>
          {canWrite && c.status === 'pending' ? (
            <Button
              size="sm"
              variant="secondary"
              loading={complete.isPending}
              onClick={() => complete.mutate()}
            >
              {t('complete')}
            </Button>
          ) : null}
          {canWrite && c.status !== 'pending' ? (
            <Button
              size="sm"
              variant="secondary"
              loading={sync.isPending}
              disabled={!linked}
              title={!linked ? t('linkFirst') : undefined}
              onClick={() => sync.mutate()}
            >
              <RefreshCw aria-hidden />
              {t('syncNow')}
            </Button>
          ) : null}
          {canWrite ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('removeLabel', { bank: c.bankName })}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 aria-hidden />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {c.lastError && c.status !== 'active' ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {c.lastError}
          </p>
        ) : null}
        {c.status === 'expired' ? <p className="text-sm text-muted">{t('expiredHint')}</p> : null}
        {c.accounts.length === 0 ? (
          <p className="text-sm text-muted">{t('noAccounts')}</p>
        ) : (
          <ul className="grid gap-2">
            {c.accounts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {a.name}
                    {a.ibanLast4 ? (
                      <span className="ml-1 text-muted">•••• {a.ibanLast4}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">
                    {a.lastSyncedAt
                      ? t('lastSynced', { date: fmt.dateTime(a.lastSyncedAt) })
                      : t('neverSynced')}
                  </p>
                </div>
                {a.accountId ? (
                  <Badge variant="success">
                    <Link2 aria-hidden />
                    {t('linked')}
                  </Badge>
                ) : canWrite ? (
                  <Button size="sm" onClick={() => setLinking(a)}>
                    <Link2 aria-hidden />
                    {t('link')}
                  </Button>
                ) : (
                  <Badge variant="outline">{t('notLinked')}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <LinkDialog
        key={linking?.id ?? 'none'}
        connection={c}
        account={linking}
        onClose={() => setLinking(null)}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('removeTitle', { bank: c.bankName })}
        description={t('removeBody')}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </Card>
  );
}

function LinkDialog({
  connection,
  account,
  onClose,
}: {
  connection: Connection;
  account: BankAccount | null;
  onClose: () => void;
}) {
  const t = useTranslations('financePlus.bankSync');
  const tc = useTranslations('common');
  const tv = useTranslations('visibility');
  const { householdId } = useHousehold();
  const accounts = useAccounts();
  const invalidate = useInvalidateFinancePlus(true);
  const toastError = useToastError();
  const [target, setTarget] = React.useState('');
  const [name, setName] = React.useState(account?.name ?? '');
  const [visibility, setVisibility] = React.useState<'household' | 'private'>('household');

  const link = useMutation({
    mutationFn: () =>
      api.financePlus.linkBankAccount({
        params: { householdId, connectionId: connection.id, bankAccountId: account?.id ?? '' },
        body: target
          ? { accountId: target, visibility }
          : { accountId: null, name: name.trim() || undefined, visibility },
      }),
    onSuccess: async () => {
      toast.success(t('linkedToast'));
      onClose();
      await invalidate();
    },
    onError: toastError,
  });

  const candidates = (accounts.data ?? []).filter(
    (a) => !account || a.currency === account.currency,
  );
  return (
    <Dialog open={account !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('linkTitle', { name: account?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('linkHint')}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            link.mutate();
          }}
        >
          <Field label={t('target')}>
            {(p) => (
              <NativeSelect {...p} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">{t('newAccount')}</option>
                {candidates.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          {!target ? (
            <Field label={t('accountName')}>
              {(p) => (
                <Input
                  {...p}
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </Field>
          ) : null}
          <Field label={t('visibility')}>
            {(p) => (
              <NativeSelect
                {...p}
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as 'household' | 'private')}
              >
                <option value="household">{tv('household')}</option>
                <option value="private">{tv('private')}</option>
              </NativeSelect>
            )}
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={link.isPending}>
              {t('link')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConnectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('financePlus.bankSync');
  const tc = useTranslations('common');
  const { householdId } = useHousehold();
  const router = useRouter();
  const toastError = useToastError();
  const [q, setQ] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);
  const banks = useQuery({
    ...apiQuery(api, 'financePlus', 'listBanks', {
      params: { householdId },
      query: { q: debounced },
    }),
    enabled: open,
  });

  const start = useMutation({
    mutationFn: (bankId: string) =>
      api.financePlus.startConnection({ params: { householdId }, body: { bankId } }),
    onSuccess: async ({ connectionId, redirectUrl }) => {
      try {
        sessionStorage.setItem(PENDING_KEY, connectionId);
      } catch {
        // storage may be unavailable
      }
      const callbackPrefix = `${API_URL}/v1/bank-sync/callback`;
      if (redirectUrl.startsWith(callbackPrefix)) {
        // The aggregator has nothing to show (e.g. the mock provider): resolve the callback
        // ourselves and continue on the return page.
        try {
          const res = await fetch(redirectUrl, {
            credentials: 'include',
            headers: { accept: 'application/json' },
          });
          const body = (await res.json()) as { redirectTo?: string };
          if (res.ok && body.redirectTo) {
            const target = new URL(body.redirectTo, window.location.origin);
            onOpenChange(false);
            router.push(`/finance/bank-sync${target.search}`);
            return;
          }
        } catch {
          // fall through to the generic return path
        }
        onOpenChange(false);
        router.push(`/finance/bank-sync?connection=${connectionId}&status=pending`);
        return;
      }
      // Real aggregator: bank login + SCA happen on the provider's web form.
      window.location.assign(redirectUrl);
    },
    onError: toastError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('chooseBank')}</DialogTitle>
          <DialogDescription>{t('chooseBankHint')}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            type="search"
            aria-label={t('searchBank')}
            placeholder={t('searchBank')}
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto" aria-live="polite">
          {banks.isPending ? (
            <LoadingState rows={3} />
          ) : banks.isError ? (
            <ErrorState error={banks.error} onRetry={() => void banks.refetch()} />
          ) : banks.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">{t('noBanks')}</p>
          ) : (
            <ul className="grid gap-1">
              {banks.data.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    disabled={start.isPending}
                    onClick={() => start.mutate(b.id)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                  >
                    {b.logoUrl ? (
                      <img src={b.logoUrl} alt="" className="size-8 rounded object-contain" />
                    ) : (
                      <span
                        className="flex size-8 items-center justify-center rounded bg-surface-muted"
                        aria-hidden
                      >
                        <Landmark className="size-4" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{b.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {[b.bic, b.city].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {start.isPending && start.variables === b.id ? (
                      <RefreshCw className="size-4 animate-spin" aria-hidden />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-muted">{t('redirectHint')}</p>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
