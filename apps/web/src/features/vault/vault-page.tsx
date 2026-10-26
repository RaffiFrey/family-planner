'use client';

import { apiQuery } from '@fp/api-client';
import { VaultDocumentType, type VaultDocument } from '@fp/contracts';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, FileLock2, Paperclip, Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';
import { MemberAvatar } from '@/components/member-avatar';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { FeatureGate, ModuleGate, UpsellState } from '@/components/upsell';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { DocumentDialog } from './document-dialog';
import { ExpiryBadge } from './expiry-badge';

export function VaultPage() {
  const t = useTranslations('vault');
  return (
    <ModuleGate action="vault.read">
      <FeatureGate
        feature="vault"
        fallback={
          <div>
            <PageHeader title={t('title')} description={t('description')} />
            <UpsellState feature="vault" />
          </div>
        }
      >
        <VaultInner />
      </FeatureGate>
    </ModuleGate>
  );
}

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function VaultInner() {
  const t = useTranslations('vault');
  const { householdId, can } = useHousehold();
  const canWrite = can('vault.write');
  const [creating, setCreating] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [holder, setHolder] = React.useState('');
  const [type, setType] = React.useState('');
  const search = useDebounced(q.trim());
  const { members } = useHousehold();

  const list = useQuery(
    apiQuery(api, 'vault', 'list', {
      params: { householdId },
      query: {
        ...(holder && holder !== 'none' ? { holderMemberId: holder } : {}),
        ...(type ? { type: type as VaultDocument['type'] } : {}),
      },
    }),
  );
  const hits = useQuery({
    ...apiQuery(api, 'vault', 'search', { params: { householdId }, query: { q: search } }),
    enabled: search.length > 0,
  });

  const addButton = canWrite ? (
    <Button onClick={() => setCreating(true)}>
      <Plus aria-hidden />
      {t('add')}
    </Button>
  ) : null;

  const docs = (list.data ?? []).filter((d) => holder !== 'none' || d.holderMemberId === null);

  // Group by holder: members in household order, then household-wide documents.
  const groups = [
    ...members.map((m) => ({
      key: m.id,
      member: m,
      docs: docs.filter((d) => d.holderMemberId === m.id),
    })),
    { key: 'household', member: null, docs: docs.filter((d) => d.holderMemberId === null) },
  ].filter((g) => g.docs.length > 0);

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} actions={addButton} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_11rem]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                type="search"
                className="pl-9"
                aria-label={t('searchLabel')}
                placeholder={t('searchPlaceholder')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <NativeSelect
              aria-label={t('filterHolder')}
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              disabled={search.length > 0}
            >
              <option value="">{t('allHolders')}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
              <option value="none">{t('household')}</option>
            </NativeSelect>
            <NativeSelect
              aria-label={t('filterType')}
              value={type}
              onChange={(e) => setType(e.target.value)}
              disabled={search.length > 0}
            >
              <option value="">{t('allTypes')}</option>
              {VaultDocumentType.options.map((k) => (
                <option key={k} value={k}>
                  {t(`types.${k}`)}
                </option>
              ))}
            </NativeSelect>
          </div>

          {search.length > 0 ? (
            hits.isPending ? (
              <LoadingState rows={3} />
            ) : hits.isError ? (
              <ErrorState error={hits.error} onRetry={() => void hits.refetch()} />
            ) : hits.data.length === 0 ? (
              <EmptyState icon={<Search />} title={t('noResults')} />
            ) : (
              <ul className="grid gap-2" aria-live="polite">
                {hits.data.map((h) => (
                  <li key={h.document.id}>
                    <DocumentRow doc={h.document} snippet={h.snippet} />
                  </li>
                ))}
              </ul>
            )
          ) : list.isPending ? (
            <LoadingState rows={4} />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : groups.length === 0 ? (
            <EmptyState
              icon={<FileLock2 />}
              title={holder || type ? t('noResults') : t('empty')}
              description={holder || type ? undefined : t('emptyHint')}
              action={holder || type ? undefined : addButton}
            />
          ) : (
            <div className="grid gap-6">
              {groups.map((g) => (
                <section key={g.key} aria-labelledby={`vault-group-${g.key}`}>
                  <h2
                    id={`vault-group-${g.key}`}
                    className="mb-2 flex items-center gap-2 text-sm font-semibold"
                  >
                    {g.member ? <MemberAvatar member={g.member} size="xs" /> : null}
                    {g.member ? g.member.displayName : t('household')}
                  </h2>
                  <ul className="grid gap-2">
                    {g.docs.map((d) => (
                      <li key={d.id}>
                        <DocumentRow doc={d} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
        <aside>
          <ExpiringCard />
        </aside>
      </div>
      <DocumentDialog open={creating} onOpenChange={setCreating} doc={null} />
    </div>
  );
}

function DocumentRow({ doc, snippet }: { doc: VaultDocument; snippet?: string | null }) {
  const t = useTranslations('vault');
  return (
    <Card className="relative flex flex-wrap items-center gap-x-3 gap-y-1 p-3 transition-colors focus-within:ring-2 focus-within:ring-primary hover:bg-surface-muted/50">
      <FileLock2 className="size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          <Link href={`/vault/${doc.id}`} className="outline-none after:absolute after:inset-0">
            {doc.title}
          </Link>
        </p>
        <p className="truncate text-xs text-muted">
          {t(`types.${doc.type}`)}
          {doc.issuer ? ` · ${doc.issuer}` : ''}
          {doc.documentNumberLast4
            ? ` · ${t('documentNumberMasked', { last4: doc.documentNumberLast4 })}`
            : ''}
        </p>
        {snippet ? <p className="mt-1 line-clamp-2 text-xs text-muted">{snippet}</p> : null}
      </div>
      {doc.fileIds.length > 0 ? (
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          <Paperclip className="size-3.5" aria-hidden />
          {doc.fileIds.length}
          <span className="sr-only">{t('files')}</span>
        </span>
      ) : null}
      <ExpiryBadge doc={doc} />
    </Card>
  );
}

function ExpiringCard() {
  const t = useTranslations('vault');
  const { householdId, memberById } = useHousehold();
  const query = useQuery(
    apiQuery(api, 'vault', 'expiring', { params: { householdId }, query: { days: 183 } }),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4 text-warning" aria-hidden />
          {t('expiringTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <LoadingState rows={2} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <p className="text-sm text-muted">{t('expiringEmpty')}</p>
        ) : (
          <ul className="grid gap-3">
            {query.data.map((d) => (
              <li key={d.id} className="grid gap-1">
                <Link
                  href={`/vault/${d.id}`}
                  className="text-sm font-medium underline-offset-4 hover:underline"
                >
                  {d.title}
                </Link>
                <span className="text-xs text-muted">
                  {memberById(d.holderMemberId)?.displayName ?? t('household')}
                </span>
                <div>
                  <ExpiryBadge doc={d} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
