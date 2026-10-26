'use client';

import { apiQuery } from '@fp/api-client';
import type { MealPlanEntry } from '@fp/contracts';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addWeeks, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, ChefHat, GripVertical, Plus, ShoppingCart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { toast } from 'sonner';
import { MemberAvatar } from '@/components/member-avatar';
import { ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Button } from '@/components/ui/button';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';
import { EntryDialog } from './entry-dialog';
import { ShoppingDialog } from './shopping-dialog';
import {
  isoWeek,
  type MealSlot,
  parseSlotKey,
  SLOTS,
  slotKey,
  toLocalDate,
  weekDays,
} from './utils';

export function MealPlanPage() {
  const t = useTranslations('meals');
  const fmt = useFormat();
  const { householdId, can } = useHousehold();
  const canWrite = can('meals.write');
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const [anchor, setAnchor] = React.useState(() => new Date());
  const [editing, setEditing] = React.useState<{
    date: string;
    slot: MealSlot;
    entry: MealPlanEntry | null;
  } | null>(null);
  const [shopping, setShopping] = React.useState(false);

  const days = React.useMemo(() => weekDays(anchor), [anchor]);
  const from = toLocalDate(days[0] ?? anchor);
  const to = toLocalDate(days[6] ?? anchor);
  const planQuery = apiQuery(api, 'meals', 'plan', {
    params: { householdId },
    query: { from, to },
  });
  const query = useQuery(planQuery);

  const byKey = React.useMemo(() => {
    const m = new Map<string, MealPlanEntry>();
    for (const e of query.data ?? []) m.set(slotKey(e.date, e.slot), e);
    return m;
  }, [query.data]);

  const move = useMutation({
    mutationFn: async ({
      source,
      target,
      targetEntry,
    }: {
      source: MealPlanEntry;
      target: { date: string; slot: MealSlot };
      targetEntry: MealPlanEntry | undefined;
    }) => {
      const body = (e: MealPlanEntry) => ({
        recipeId: e.recipeId,
        title: e.title,
        servings: e.servings,
        cookMemberId: e.cookMemberId,
        notes: e.notes,
      });
      await api.meals.upsertEntry({
        params: { householdId, date: target.date, slot: target.slot },
        body: body(source),
      });
      // Swap when the target was taken, otherwise clear the source slot.
      if (targetEntry)
        await api.meals.upsertEntry({
          params: { householdId, date: source.date, slot: source.slot },
          body: body(targetEntry),
        });
      else
        await api.meals.removeEntry({
          params: { householdId, date: source.date, slot: source.slot },
        });
    },
    onMutate: async ({ source, target, targetEntry }) => {
      await queryClient.cancelQueries({ queryKey: planQuery.queryKey });
      const previous = queryClient.getQueryData<MealPlanEntry[]>(planQuery.queryKey);
      queryClient.setQueryData<MealPlanEntry[]>(planQuery.queryKey, (list) =>
        (list ?? []).map((e) => {
          if (e.id === source.id) return { ...e, date: target.date, slot: target.slot };
          if (targetEntry && e.id === targetEntry.id)
            return { ...e, date: source.date, slot: source.slot };
          return e;
        }),
      );
      return { previous };
    },
    onSuccess: () => toast.success(t('plan.moved')),
    onError: (err, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(planQuery.queryKey, ctx.previous);
      toastError(err);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['meals'] }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const source = byKey.get(String(e.active.id));
    const target = parseSlotKey(String(e.over.id));
    if (!source || (source.date === target.date && source.slot === target.slot)) return;
    move.mutate({ source, target, targetEntry: byKey.get(String(e.over.id)) });
  };

  const today = new Date();
  const firstDay = days[0] ?? anchor;
  const lastDay = days[6] ?? anchor;

  return (
    <div>
      <PageHeader
        title={t('plan.title')}
        description={t('description')}
        actions={
          canWrite ? (
            <Button variant="secondary" onClick={() => setShopping(true)}>
              <ShoppingCart aria-hidden />
              {t('plan.toShopping')}
            </Button>
          ) : null
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="icon"
          aria-label={t('plan.prevWeek')}
          onClick={() => setAnchor((a) => addWeeks(a, -1))}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Button variant="secondary" onClick={() => setAnchor(new Date())}>
          {t('plan.thisWeek')}
        </Button>
        <Button
          variant="secondary"
          size="icon"
          aria-label={t('plan.nextWeek')}
          onClick={() => setAnchor((a) => addWeeks(a, 1))}
        >
          <ChevronRight aria-hidden />
        </Button>
        <p className="ml-1 text-sm font-medium" aria-live="polite">
          {t('plan.week', { week: isoWeek(firstDay) })} ·{' '}
          {t('plan.range', {
            from: fmt.date(firstDay, { day: 'numeric', month: 'short' }),
            to: fmt.date(lastDay, { day: 'numeric', month: 'short', year: 'numeric' }),
          })}
        </p>
      </div>
      {query.isPending ? (
        <LoadingState rows={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          {canWrite ? <p className="mb-3 text-xs text-muted">{t('plan.dragHint')}</p> : null}
          {/* Desktop: days as columns. Mobile: one card per day. */}
          <div className="grid gap-3 md:grid-cols-7 md:gap-2">
            {days.map((d) => {
              const date = toLocalDate(d);
              const isToday = isSameDay(d, today);
              return (
                <section
                  key={date}
                  aria-labelledby={`day-${date}`}
                  className={cn(
                    'grid gap-2 rounded-lg border border-border bg-surface p-2',
                    isToday && 'border-primary/60 ring-1 ring-primary/30',
                  )}
                >
                  <h2
                    id={`day-${date}`}
                    className={cn('px-1 text-sm font-semibold', isToday && 'text-primary')}
                  >
                    {fmt.date(d, { weekday: 'short', day: 'numeric', month: 'numeric' })}
                  </h2>
                  {SLOTS.map((slot) => (
                    <SlotCell
                      key={slot}
                      date={date}
                      day={d}
                      slot={slot}
                      entry={byKey.get(slotKey(date, slot))}
                      canWrite={canWrite}
                      onOpen={(entry) => setEditing({ date, slot, entry: entry ?? null })}
                    />
                  ))}
                </section>
              );
            })}
          </div>
        </DndContext>
      )}
      <EntryDialog
        target={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        canWrite={canWrite}
      />
      <ShoppingDialog open={shopping} onOpenChange={setShopping} from={from} to={to} />
    </div>
  );
}

function SlotCell({
  date,
  day,
  slot,
  entry,
  canWrite,
  onOpen,
}: {
  date: string;
  day: Date;
  slot: MealSlot;
  entry: MealPlanEntry | undefined;
  canWrite: boolean;
  onOpen: (entry: MealPlanEntry | undefined) => void;
}) {
  const t = useTranslations('meals');
  const fmt = useFormat();
  const id = slotKey(date, slot);
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !canWrite });
  const dayLabel = fmt.date(day, { weekday: 'long', day: 'numeric', month: 'long' });
  const slotLabel = t(`slots.${slot}`);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-14 rounded-md border border-dashed border-transparent p-0.5 transition-colors',
        isOver && 'border-primary bg-primary/5',
      )}
    >
      <p className="px-1 text-[11px] font-medium tracking-wide text-muted uppercase">{slotLabel}</p>
      {entry ? (
        <EntryChip
          entry={entry}
          canWrite={canWrite}
          label={t('plan.editMealFor', { slot: slotLabel, date: dayLabel })}
          onOpen={() => onOpen(entry)}
        />
      ) : canWrite ? (
        <button
          type="button"
          onClick={() => onOpen(undefined)}
          aria-label={t('plan.addMealFor', { slot: slotLabel, date: dayLabel })}
          className="flex h-8 w-full items-center justify-center rounded-md text-muted outline-none hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      ) : (
        <p className="px-1 text-xs text-muted">–</p>
      )}
    </div>
  );
}

function EntryChip({
  entry,
  canWrite,
  label,
  onOpen,
}: {
  entry: MealPlanEntry;
  canWrite: boolean;
  label: string;
  onOpen: () => void;
}) {
  const { memberById } = useHousehold();
  const id = slotKey(entry.date, entry.slot);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled: !canWrite,
  });
  const cook = memberById(entry.cookMemberId);
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-start gap-1 rounded-md bg-primary/10 px-1.5 py-1 text-sm',
        isDragging && 'relative z-10 shadow-lg ring-2 ring-primary',
      )}
    >
      {canWrite ? (
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none rounded-sm text-muted outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={label}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left outline-none focus-visible:underline"
      >
        <span className="line-clamp-2 font-medium break-words">
          {entry.recipeId ? (
            <ChefHat className="mr-1 inline size-3.5 align-[-2px] text-primary" aria-hidden />
          ) : null}
          {entry.title}
        </span>
      </button>
      {cook ? <MemberAvatar member={cook} size="xs" /> : null}
    </div>
  );
}
