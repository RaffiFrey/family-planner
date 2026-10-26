'use client';

import { apiQuery } from '@fp/api-client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BookOpen, Clock, Link2, Plus, Search, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { ImportDialog } from './import-dialog';
import { RecipeFormDialog, type RecipeDraftInput } from './recipe-form-dialog';

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function RecipesPage() {
  const t = useTranslations('meals.recipes');
  const router = useRouter();
  const { householdId, can } = useHousehold();
  const canWrite = can('meals.write');
  const [q, setQ] = React.useState('');
  const [tag, setTag] = React.useState('');
  const debouncedQ = useDebounced(q.trim());
  const [creating, setCreating] = React.useState<{ initial: RecipeDraftInput | null } | null>(null);
  const [importing, setImporting] = React.useState(false);
  const id = React.useId();

  const query = useQuery({
    ...apiQuery(api, 'meals', 'listRecipes', {
      params: { householdId },
      query: { q: debouncedQ || undefined, tag: tag || undefined },
    }),
    placeholderData: keepPreviousData,
  });
  // Tags of the whole recipe box (unfiltered) for the filter.
  const all = useQuery(
    apiQuery(api, 'meals', 'listRecipes', { params: { householdId }, query: {} }),
  );
  const tags = React.useMemo(
    () => [...new Set((all.data ?? []).flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b)),
    [all.data],
  );
  const filtered = Boolean(debouncedQ || tag);

  const actions = canWrite ? (
    <>
      <Button variant="secondary" onClick={() => setImporting(true)}>
        <Link2 aria-hidden />
        {t('import')}
      </Button>
      <Button onClick={() => setCreating({ initial: null })}>
        <Plus aria-hidden />
        {t('add')}
      </Button>
    </>
  ) : null;

  return (
    <div>
      <PageHeader title={t('title')} actions={actions} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="grid min-w-0 flex-1 gap-1.5 sm:max-w-sm">
          <Label htmlFor={`${id}-q`}>{t('search')}</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <Input
              id={`${id}-q`}
              type="search"
              value={q}
              placeholder={t('searchPlaceholder')}
              className="pl-9"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        {tags.length > 0 ? (
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-tag`}>{t('tagFilter')}</Label>
            <NativeSelect id={`${id}-tag`} value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">{t('allTags')}</option>
              {tags.map((tg) => (
                <option key={tg} value={tg}>
                  {tg}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
      </div>
      {query.isPending ? (
        <LoadingState rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        filtered ? (
          <EmptyState icon={<Search />} title={t('noResults')} />
        ) : (
          <EmptyState
            icon={<BookOpen />}
            title={t('empty')}
            description={t('emptyHint')}
            action={actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          />
        )
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy={query.isFetching}>
          {query.data.map((r) => {
            const minutes = (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0);
            return (
              <li key={r.id}>
                <Link
                  href={`/meals/recipes/${r.id}`}
                  className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface outline-none hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {r.imageUrl ? (
                    // External recipe images (no Next image optimisation for arbitrary hosts).
                    <img src={r.imageUrl} alt="" className="h-32 w-full object-cover" />
                  ) : (
                    <div className="flex h-20 items-center justify-center bg-surface-muted text-muted">
                      <BookOpen className="size-6" aria-hidden />
                    </div>
                  )}
                  <div className="grid gap-2 p-3">
                    <p className="font-medium">{r.title}</p>
                    <div className="flex flex-wrap gap-3 text-xs text-muted">
                      {minutes > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3.5" aria-hidden />
                          {t('minutes', { count: minutes })}
                        </span>
                      ) : null}
                      {r.servings ? (
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3.5" aria-hidden />
                          {t('servings', { count: r.servings })}
                        </span>
                      ) : null}
                    </div>
                    {r.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {r.tags.map((tg) => (
                          <Badge key={tg} variant="secondary">
                            {tg}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <RecipeFormDialog
        open={creating !== null}
        onOpenChange={(o) => !o && setCreating(null)}
        recipe={null}
        initial={creating?.initial ?? null}
        onSaved={(r) => router.push(`/meals/recipes/${r.id}`)}
      />
      <ImportDialog
        open={importing}
        onOpenChange={setImporting}
        onEditDraft={(draft) => setCreating({ initial: draft })}
        onImported={(r) => router.push(`/meals/recipes/${r.id}`)}
      />
    </div>
  );
}
