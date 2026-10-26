'use client';

import { apiQuery } from '@fp/api-client';
import type { List } from '@fp/contracts';
import { useQuery } from '@tanstack/react-query';
import { Ellipsis, Pencil, Plus, ShoppingCart, Trash } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';
import { EmptyState, PageHeader, QueryView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/use-format';
import { ListFormDialog } from './list-form-dialog';
import { ListKindIcon } from './list-kind-icon';
import { useListMutations } from './use-list-mutations';

export function ListsOverview() {
  const t = useTranslations('lists');
  const tn = useTranslations('nav');
  const tc = useTranslations('common');
  const tk = useTranslations('listKinds');
  const { householdId, can } = useHousehold();
  const fmt = useFormat();
  const { remove } = useListMutations();
  const query = useQuery(apiQuery(api, 'lists', 'list', { params: { householdId } }));
  const [editing, setEditing] = React.useState<{ list: List | null } | null>(null);
  const [deleting, setDeleting] = React.useState<List | null>(null);
  const canWrite = can('lists.write');

  const newButton = canWrite ? (
    <Button onClick={() => setEditing({ list: null })}>
      <Plus aria-hidden />
      {t('newList')}
    </Button>
  ) : null;

  return (
    <>
      <PageHeader title={tn('lists')} description={t('pageDescription')} actions={newButton} />
      <QueryView query={query} rows={4}>
        {(lists) =>
          lists.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart />}
              title={t('empty')}
              description={t('emptyHint')}
              action={newButton}
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[...lists]
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .map((list) => (
                  <li
                    key={list.id}
                    className="relative flex items-start gap-3 rounded-lg border border-border bg-surface p-4 hover:bg-surface-muted"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <ListKindIcon kind={list.kind} className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/lists/${list.id}`}
                        className="block truncate font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-primary"
                      >
                        {list.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <Badge variant={list.openCount > 0 ? 'default' : 'secondary'}>
                          {t('openCount', { count: list.openCount })}
                        </Badge>
                        <span>{tk(list.kind)}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {t('updatedAt', {
                          date: fmt.date(list.updatedAt, { day: 'numeric', month: 'short' }),
                        })}
                      </p>
                    </div>
                    {canWrite ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="relative z-10"
                            aria-label={t('listActions', { name: list.name })}
                          >
                            <Ellipsis aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing({ list })}>
                            <Pencil aria-hidden />
                            {tc('edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setDeleting(list)}
                          >
                            <Trash aria-hidden />
                            {t('deleteList')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </li>
                ))}
            </ul>
          )
        }
      </QueryView>
      <ListFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        list={editing?.list ?? null}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('deleteList')}
        description={deleting ? t('deleteListConfirm', { name: deleting.name }) : undefined}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }
      />
    </>
  );
}
