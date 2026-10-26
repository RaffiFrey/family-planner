'use client';

import { ApiError, apiQuery, type Output } from '@fp/api-client';
import type { TripItem } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BedDouble,
  CalendarRange,
  Car,
  Copy,
  ListChecks,
  MapPin,
  MoreVertical,
  Pencil,
  Plane,
  Plus,
  StickyNote,
  Ticket,
  TrainFront,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { MemberAvatar } from '@/components/member-avatar';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/misc';
import { ModuleGate } from '@/components/upsell';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { ItemDialog } from './item-dialog';
import { PackingDialog } from './packing-dialog';
import { TripDialog } from './trip-dialog';
import { asCurrency, daysBetween, noon } from './utils';

const KIND_ICONS = {
  flight: Plane,
  train: TrainFront,
  car: Car,
  hotel: BedDouble,
  activity: Ticket,
  note: StickyNote,
} as const;

export function TripDetail({ tripId }: { tripId: string }) {
  return (
    <ModuleGate action="travel.read">
      <TripDetailInner tripId={tripId} />
    </ModuleGate>
  );
}

function TripDetailInner({ tripId }: { tripId: string }) {
  const t = useTranslations('travel');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const { householdId, can, members } = useHousehold();
  const canWrite = can('travel.write');
  const query = useQuery(apiQuery(api, 'travel', 'get', { params: { householdId, tripId } }));
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [itemDialog, setItemDialog] = React.useState<{ open: boolean; item: TripItem | null }>({
    open: false,
    item: null,
  });
  const [removingItem, setRemovingItem] = React.useState<TripItem | null>(null);
  const [packingOpen, setPackingOpen] = React.useState(false);

  const remove = useMutation({
    mutationFn: () => api.travel.remove({ params: { householdId, tripId } }),
    onSuccess: async () => {
      toast.success(t('deleted'));
      router.push('/travel');
      await queryClient.invalidateQueries({ queryKey: ['travel'] });
    },
    onError: toastError,
  });

  const removeItem = useMutation({
    mutationFn: (item: TripItem) =>
      api.travel.removeItem({ params: { householdId, tripId, itemId: item.id } }),
    onMutate: async (item) => {
      setRemovingItem(null);
      const key = apiQuery(api, 'travel', 'get', { params: { householdId, tripId } }).queryKey;
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData(key);
      queryClient.setQueryData<Output<'travel', 'get'>>(key, (old) =>
        old ? { ...old, items: old.items.filter((i) => i.id !== item.id) } : old,
      );
      return { prev, key };
    },
    onError: (err, _item, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.key, ctx.prev);
      toastError(err);
    },
    onSuccess: () => toast.success(t('itinerary.deleted')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['travel'] }),
  });

  if (query.isPending) return <LoadingState rows={5} />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <EmptyState
          title={t('notFound')}
          action={
            <Button asChild variant="secondary">
              <Link href="/travel">{t('back')}</Link>
            </Button>
          }
        />
      );
    }
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const trip = query.data;
  const travellers = members.filter((m) => trip.memberIds.includes(m.id));

  // Group itinerary by local day; undated items at the end.
  const sorted = [...trip.items].sort((a, b) => {
    if (!a.startAt) return b.startAt ? 1 : a.createdAt.localeCompare(b.createdAt);
    if (!b.startAt) return -1;
    return a.startAt.localeCompare(b.startAt);
  });
  const groups: { key: string; label: string; items: TripItem[] }[] = [];
  for (const item of sorted) {
    const key = item.startAt
      ? fmt.date(item.startAt, { year: 'numeric', month: '2-digit', day: '2-digit' })
      : 'none';
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = {
        key,
        label: item.startAt
          ? fmt.date(item.startAt, { weekday: 'long', day: 'numeric', month: 'long' })
          : t('itinerary.unscheduled'),
        items: [],
      };
      groups.push(group);
    }
    group.items.push(item);
  }

  return (
    <div>
      <Link
        href="/travel"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('back')}
      </Link>
      <PageHeader
        title={trip.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {trip.destination ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {trip.destination}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <CalendarRange className="size-3.5" aria-hidden />
              {t('dateRange', {
                from: fmt.date(noon(trip.startDate)),
                to: fmt.date(noon(trip.endDate)),
              })}{' '}
              · {t('days', { count: daysBetween(trip.startDate, trip.endDate) + 1 })}
            </span>
          </span>
        }
        actions={
          canWrite ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label={tu('actions')}>
                  <MoreVertical aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil aria-hidden />
                  {tc('edit')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                  <Trash2 aria-hidden />
                  {tc('delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
      />
      {travellers.length > 0 ? (
        <ul className="mb-6 flex flex-wrap gap-2" aria-label={t('members')}>
          {travellers.map((m) => (
            <li
              key={m.id}
              className="inline-flex items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1 text-sm"
            >
              <MemberAvatar member={m} size="xs" />
              {m.displayName}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="itinerary-heading">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="itinerary-heading" className="text-lg font-semibold">
              {t('itinerary.title')}
            </h2>
            {canWrite ? (
              <Button size="sm" onClick={() => setItemDialog({ open: true, item: null })}>
                <Plus aria-hidden />
                {t('itinerary.add')}
              </Button>
            ) : null}
          </div>
          {groups.length === 0 ? (
            <EmptyState icon={<Ticket />} title={t('itinerary.empty')} />
          ) : (
            <div className="grid gap-5">
              {groups.map((g) => (
                <div key={g.key}>
                  <h3 className="mb-2 text-sm font-semibold text-muted">{g.label}</h3>
                  <ol className="grid gap-2">
                    {g.items.map((item) => {
                      const Icon = KIND_ICONS[item.kind];
                      return (
                        <li key={item.id}>
                          <Card className="flex items-start gap-3 p-3">
                            <span
                              className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                              aria-hidden
                            >
                              <Icon className="size-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">
                                <span className="sr-only">
                                  {t(`itinerary.kinds.${item.kind}`)}:{' '}
                                </span>
                                {item.title}
                              </p>
                              <p className="text-sm text-muted">
                                {item.startAt ? fmt.time(item.startAt) : null}
                                {item.endAt
                                  ? ` – ${
                                      item.startAt &&
                                      fmt.date(item.startAt) === fmt.date(item.endAt)
                                        ? fmt.time(item.endAt)
                                        : fmt.dateTime(item.endAt)
                                    }`
                                  : null}
                                {item.location
                                  ? `${item.startAt ? ' · ' : ''}${item.location}`
                                  : null}
                              </p>
                              {item.confirmationCode ? (
                                <Badge variant="secondary" className="mt-1 font-mono">
                                  {item.confirmationCode}
                                </Badge>
                              ) : null}
                              {item.notes ? (
                                <p className="mt-1 text-sm whitespace-pre-line">{item.notes}</p>
                              ) : null}
                            </div>
                            {canWrite ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" aria-label={tu('actions')}>
                                    <MoreVertical aria-hidden />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onSelect={() => setItemDialog({ open: true, item })}
                                  >
                                    <Pencil aria-hidden />
                                    {tc('edit')}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() => setRemovingItem(item)}
                                  >
                                    <Trash2 aria-hidden />
                                    {tc('delete')}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </Card>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
          )}
          {trip.notes ? (
            <Card className="mt-6 p-4">
              <h3 className="mb-1 text-sm font-semibold">{t('notes')}</h3>
              <p className="text-sm whitespace-pre-line">{trip.notes}</p>
            </Card>
          ) : null}
        </section>

        <aside className="grid content-start gap-4">
          <BudgetCard trip={trip} />
          <PackingCard
            packingListId={trip.packingListId}
            canWrite={canWrite}
            onOpen={() => setPackingOpen(true)}
          />
        </aside>
      </div>

      <TripDialog open={editing} onOpenChange={setEditing} trip={trip} />
      <ItemDialog
        open={itemDialog.open}
        onOpenChange={(open) => setItemDialog((d) => ({ ...d, open }))}
        tripId={trip.id}
        item={itemDialog.item}
        defaultStart={trip.startDate}
      />
      <PackingDialog
        open={packingOpen}
        onOpenChange={setPackingOpen}
        tripId={trip.id}
        tripName={trip.name}
        hasList={trip.packingListId !== null}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('deleteTitle')}
        description={t('deleteBody')}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
      <ConfirmDialog
        open={removingItem !== null}
        onOpenChange={(open) => !open && setRemovingItem(null)}
        title={t('itinerary.deleteTitle')}
        description={removingItem?.title}
        confirmLabel={tc('delete')}
        destructive
        onConfirm={() => removingItem && removeItem.mutate(removingItem)}
      />
    </div>
  );
}

function BudgetCard({ trip }: { trip: Pick<Output<'travel', 'get'>, 'budget' | 'financeTag'> }) {
  const t = useTranslations('travel.budgetCard');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const budget = trip.budget;
  const cur = asCurrency(budget?.currency ?? fmt.currency, fmt.currency);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!budget ? (
          <p className="text-sm text-muted">{t('hidden')}</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-muted">{t('spent')}</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {fmt.money(budget.spentMinor, cur)}
                </dd>
              </div>
              <div className="text-right">
                <dt className="text-muted">{t('remaining')}</dt>
                <dd
                  className={
                    budget.remainingMinor !== null && budget.remainingMinor < 0
                      ? 'text-lg font-semibold text-danger tabular-nums'
                      : 'text-lg font-semibold tabular-nums'
                  }
                >
                  {budget.remainingMinor === null ? '–' : fmt.money(budget.remainingMinor, cur)}
                </dd>
              </div>
            </dl>
            {budget.budgetMinor !== null && budget.budgetMinor > 0 ? (
              <>
                <Progress
                  value={(budget.spentMinor / budget.budgetMinor) * 100}
                  tone={
                    budget.spentMinor > budget.budgetMinor
                      ? 'exceeded'
                      : budget.spentMinor > budget.budgetMinor * 0.85
                        ? 'warning'
                        : 'ok'
                  }
                  aria-label={t('spent')}
                />
                <p className="text-xs text-muted">
                  {fmt.money(budget.spentMinor, cur)} / {fmt.money(budget.budgetMinor, cur)}
                  {budget.spentMinor > budget.budgetMinor
                    ? ` · ${t('overBy', { amount: fmt.money(budget.spentMinor - budget.budgetMinor, cur) })}`
                    : null}
                </p>
              </>
            ) : budget.budgetMinor === null ? (
              <p className="text-xs text-muted">{t('noBudget')}</p>
            ) : null}
            <p className="text-xs text-muted">
              {t('transactions', { count: budget.transactionCount })}
            </p>
            <div className="rounded-md bg-surface-muted p-2 text-xs">
              <p className="mb-1">{t('tagHint', { tag: trip.financeTag })}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(trip.financeTag)
                    .then(() => toast.success(tu('copied')));
                }}
              >
                <Copy aria-hidden />
                {t('copyTag')}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PackingCard({
  packingListId,
  canWrite,
  onOpen,
}: {
  packingListId: string | null;
  canWrite: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations('travel.packing');
  const td = useTranslations('dashboard');
  const { householdId, can } = useHousehold();
  const list = useQuery({
    ...apiQuery(api, 'lists', 'get', { params: { householdId, listId: packingListId ?? '' } }),
    enabled: packingListId !== null && can('lists.read'),
  });
  const total = list.data?.items.length ?? 0;
  const open = list.data?.openCount ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="size-4" aria-hidden />
          {t('title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {packingListId === null ? (
          <p className="text-sm text-muted">{t('none')}</p>
        ) : list.data ? (
          <>
            <p className="font-medium">{list.data.name}</p>
            <Progress value={total ? ((total - open) / total) * 100 : 0} aria-label={t('title')} />
            <p className="text-xs text-muted">
              {total - open}/{total} · {td('openItems', { count: open })}
            </p>
          </>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {packingListId !== null ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={`/lists/${packingListId}`}>{t('open')}</Link>
            </Button>
          ) : null}
          {canWrite ? (
            <Button size="sm" variant={packingListId ? 'ghost' : 'default'} onClick={onOpen}>
              <Plus aria-hidden />
              {packingListId ? t('extend') : t('create')}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
