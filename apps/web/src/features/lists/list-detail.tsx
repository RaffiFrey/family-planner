'use client';

import { ApiError, apiQuery } from '@fp/api-client';
import { ITEM_CATEGORIES, type ListItem } from '@fp/contracts';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Ellipsis, Eraser, Pencil, Trash } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { MemberAvatar } from '@/components/member-avatar';
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
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ItemDialog } from './item-dialog';
import { ListFormDialog } from './list-form-dialog';
import { ListKindIcon } from './list-kind-icon';
import { QuickAdd } from './quick-add';
import { useItemMutations, useListMutations } from './use-list-mutations';

const isTemp = (item: ListItem) => item.id.startsWith('temp-');
const byPosition = (a: ListItem, b: ListItem) => a.position - b.position;

export function ListDetail({ listId }: { listId: string }) {
  const t = useTranslations('lists');
  const tc = useTranslations('common');
  const tk = useTranslations('listKinds');
  const tcat = useTranslations('itemCategories');
  const router = useRouter();
  const { householdId, can, memberById } = useHousehold();
  const query = useQuery(apiQuery(api, 'lists', 'get', { params: { householdId, listId } }));
  const items = useItemMutations(listId);
  const lists = useListMutations();
  const [editingItem, setEditingItem] = React.useState<ListItem | null>(null);
  const [editingList, setEditingList] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const canWrite = can('lists.write');

  if (query.isPending) return <LoadingState rows={6} />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <EmptyState
          title={tc('empty')}
          action={
            <Button asChild variant="secondary">
              <Link href="/lists">{t('back')}</Link>
            </Button>
          }
        />
      );
    }
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const list = query.data;
  const open = list.items.filter((i) => !i.checked).sort(byPosition);
  const done = list.items
    .filter((i) => i.checked)
    .sort((a, b) => (b.checkedAt ?? '').localeCompare(a.checkedAt ?? ''));
  const grouped =
    list.kind === 'shopping'
      ? ITEM_CATEGORIES.map((c) => ({
          category: c,
          items: open.filter((i) => i.category === c),
        })).filter((g) => g.items.length)
      : null;

  const toggle = (item: ListItem, checked: boolean) =>
    items.update.mutate({ itemId: item.id, body: { checked } });

  const renderItem = (item: ListItem) => {
    const checker = item.checked ? memberById(item.checkedByMemberId) : undefined;
    const pending = isTemp(item);
    return (
      <li
        key={item.id}
        className={cn('flex items-center gap-3 px-3 py-2', pending && 'opacity-60')}
      >
        <Checkbox
          checked={item.checked}
          disabled={!canWrite || pending}
          aria-label={t('check', { text: item.text })}
          onCheckedChange={(c) => toggle(item, c === true)}
        />
        <button
          type="button"
          disabled={!canWrite || pending}
          onClick={() => setEditingItem(item)}
          aria-label={t('editItemNamed', { text: item.text })}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-primary',
            item.checked && 'text-muted line-through',
          )}
        >
          <span className="truncate">{item.text}</span>
          {item.quantity ? <Badge variant="secondary">{item.quantity}</Badge> : null}
        </button>
        {checker ? <MemberAvatar member={checker} size="xs" /> : null}
        {canWrite ? (
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            aria-label={t('deleteItem', { text: item.text })}
            onClick={() => items.remove.mutate(item.id)}
          >
            <Trash aria-hidden />
          </Button>
        ) : null}
      </li>
    );
  };

  return (
    <>
      <Link
        href="/lists"
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t('back')}
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ListKindIcon kind={list.kind} className="size-6 text-primary" />
            {list.name}
          </span>
        }
        description={tk(list.kind)}
        actions={
          canWrite ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label={t('listActions', { name: list.name })}
                >
                  <Ellipsis aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditingList(true)}>
                  <Pencil aria-hidden />
                  {t('editList')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={done.length === 0}
                  onSelect={() => items.clearChecked.mutate()}
                >
                  <Eraser aria-hidden />
                  {t('clearChecked')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash aria-hidden />
                  {t('deleteList')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
      />

      {canWrite ? (
        <div className="mb-4">
          <QuickAdd onAdd={(item) => items.add.mutate(item)} />
        </div>
      ) : null}

      {list.items.length === 0 ? (
        <EmptyState
          title={t('emptyItems')}
          description={canWrite ? t('emptyItemsHint') : undefined}
        />
      ) : (
        <div className="grid gap-4">
          {open.length > 0 ? (
            grouped ? (
              grouped.map((g) => (
                <section key={g.category} aria-labelledby={`cat-${g.category}`}>
                  <h2
                    id={`cat-${g.category}`}
                    className="mb-1 px-1 text-xs font-semibold tracking-wide text-muted uppercase"
                  >
                    {tcat(g.category)}
                  </h2>
                  <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                    {g.items.map(renderItem)}
                  </ul>
                </section>
              ))
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {open.map(renderItem)}
              </ul>
            )
          ) : null}

          {done.length > 0 ? (
            <details className="group rounded-lg border border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <ChevronRight
                    className="size-4 transition-transform group-open:rotate-90"
                    aria-hidden
                  />
                  {t('done', { count: done.length })}
                </span>
                {canWrite ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={items.clearChecked.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      items.clearChecked.mutate();
                    }}
                  >
                    <Eraser aria-hidden />
                    {t('clearChecked')}
                  </Button>
                ) : null}
              </summary>
              <ul className="divide-y divide-border border-t border-border">
                {done.map(renderItem)}
              </ul>
            </details>
          ) : null}
        </div>
      )}

      <ItemDialog
        item={editingItem}
        onOpenChange={(o) => !o && setEditingItem(null)}
        onSave={(patch) => {
          if (editingItem) items.update.mutate({ itemId: editingItem.id, body: patch });
          setEditingItem(null);
        }}
        onDelete={() => {
          if (editingItem) items.remove.mutate(editingItem.id);
          setEditingItem(null);
        }}
      />
      <ListFormDialog open={editingList} onOpenChange={setEditingList} list={list} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('deleteList')}
        description={t('deleteListConfirm', { name: list.name })}
        confirmLabel={tc('delete')}
        destructive
        loading={lists.remove.isPending}
        onConfirm={() =>
          lists.remove.mutate(list.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              router.replace('/lists');
            },
          })
        }
      />
    </>
  );
}
