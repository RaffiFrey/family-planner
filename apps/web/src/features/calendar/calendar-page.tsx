'use client';

import { apiQuery } from '@fp/api-client';
import type { Calendar, Occurrence } from '@fp/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/use-format';
import { CalendarDialog, type CalendarDialogState } from './calendar-dialog';
import { CalendarsPanel } from './calendars-panel';
import { useReadOnlyCalendarIds } from './use-read-only-calendars';
import {
  addDays,
  type CalendarView,
  type DayKey,
  dayStart,
  isBanner,
  keyToDate,
  occurrenceSpan,
  shiftAnchor,
  todayKey,
  visibleDays,
} from './date-utils';
import { EventDialog, type EventDialogState } from './event-dialog';
import { MonthView } from './month-view';
import { TimeGridView } from './time-grid-view';

const VIEWS: CalendarView[] = ['month', 'week', 'day'];

function initialView(): CalendarView {
  if (typeof window === 'undefined') return 'month';
  return window.matchMedia('(min-width: 640px)').matches ? 'month' : 'day';
}

export function CalendarPage() {
  const t = useTranslations('calendar');
  const { householdId, can } = useHousehold();
  const fmt = useFormat();
  const canWrite = can('calendar.write');
  const timeZone = fmt.timeZone;

  const [view, setView] = React.useState<CalendarView>(initialView);
  const [anchor, setAnchor] = React.useState<DayKey>(() => todayKey(timeZone));
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(() => new Set());
  const [eventDialog, setEventDialog] = React.useState<EventDialogState | null>(null);
  const [calendarDialog, setCalendarDialog] = React.useState<CalendarDialogState | null>(null);
  const today = todayKey(timeZone);

  const days = React.useMemo(() => visibleDays(view, anchor), [view, anchor]);
  const firstDay = days[0] ?? anchor;
  const lastDay = days[days.length - 1] ?? anchor;
  const from = dayStart(firstDay, timeZone).toISOString();
  const to = dayStart(addDays(lastDay, 1), timeZone).toISOString();

  const calendarsQuery = useQuery(
    apiQuery(api, 'calendar', 'listCalendars', { params: { householdId } }),
  );
  const occurrencesQuery = useQuery({
    ...apiQuery(api, 'calendar', 'occurrences', { params: { householdId }, query: { from, to } }),
    placeholderData: keepPreviousData,
  });

  const calendars = React.useMemo<Calendar[]>(
    () => calendarsQuery.data ?? [],
    [calendarsQuery.data],
  );
  const colors = React.useMemo(() => new Map(calendars.map((c) => [c.id, c.color])), [calendars]);
  const readOnlyIds = useReadOnlyCalendarIds();
  const writableCalendars = React.useMemo(
    () => calendars.filter((c) => !readOnlyIds.has(c.id)),
    [calendars, readOnlyIds],
  );

  const byDay = React.useMemo(() => {
    const map = new Map<DayKey, Occurrence[]>();
    const visible = (occurrencesQuery.data ?? []).filter((o) => !hidden.has(o.calendarId));
    for (const o of visible) {
      const { startKey, endKey } = occurrenceSpan(o, timeZone);
      for (
        let d = startKey < firstDay ? firstDay : startKey;
        d <= endKey && d <= lastDay;
        d = addDays(d, 1)
      ) {
        const list = map.get(d) ?? [];
        list.push(o);
        map.set(d, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const ab = isBanner(a, timeZone) ? 0 : 1;
        const bb = isBanner(b, timeZone) ? 0 : 1;
        return ab - bb || a.start.localeCompare(b.start);
      });
    }
    return map;
  }, [occurrencesQuery.data, hidden, timeZone, firstDay, lastDay]);

  const timeLabel = React.useCallback(
    (o: Occurrence) => (isBanner(o, timeZone) ? undefined : fmt.time(o.start)),
    [fmt, timeZone],
  );

  const title = React.useMemo(() => {
    const opts = { timeZone: 'UTC' } as const;
    if (view === 'month') {
      return new Intl.DateTimeFormat(fmt.intlLocale, {
        ...opts,
        month: 'long',
        year: 'numeric',
      }).format(keyToDate(anchor));
    }
    if (view === 'week') {
      return new Intl.DateTimeFormat(fmt.intlLocale, {
        ...opts,
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).formatRange(keyToDate(firstDay), keyToDate(lastDay));
    }
    return new Intl.DateTimeFormat(fmt.intlLocale, {
      ...opts,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(keyToDate(anchor));
  }, [view, anchor, firstDay, lastDay, fmt.intlLocale]);

  const toggleCalendar = (id: string, visible: boolean) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreate = (day: DayKey, time?: string) => {
    if (!canWrite) return;
    if (writableCalendars.length === 0) {
      setCalendarDialog({ mode: 'create' });
      return;
    }
    setEventDialog({ mode: 'create', day, time });
  };
  const openOccurrence = (occurrence: Occurrence) => setEventDialog({ mode: 'edit', occurrence });
  const showDay = (day: DayKey) => {
    setAnchor(day);
    setView('day');
  };

  const panel = (idPrefix: string) => (
    <CalendarsPanel
      idPrefix={idPrefix}
      calendars={calendars}
      hidden={hidden}
      onToggle={toggleCalendar}
      onEdit={(calendar) => setCalendarDialog({ mode: 'edit', calendar })}
      onCreate={() => setCalendarDialog({ mode: 'create' })}
      canWrite={canWrite}
      readOnlyIds={readOnlyIds}
    />
  );

  const viewProps = {
    days,
    today,
    byDay,
    colors,
    intlLocale: fmt.intlLocale,
    timeLabel,
    canWrite,
    onOpen: openOccurrence,
    onShowDay: showDay,
  };

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          canWrite ? (
            <Button
              onClick={() =>
                openCreate(
                  view === 'month' && !anchor.startsWith(today.slice(0, 7)) ? anchor : today,
                )
              }
            >
              <Plus aria-hidden />
              {t('newEvent')}
            </Button>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          {calendarsQuery.isSuccess ? panel('cal-side') : <LoadingState rows={3} />}
        </aside>

        <div className="grid min-w-0 content-start gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setAnchor((a) => shiftAnchor(view, a, -1))}
                aria-label={t('previous')}
              >
                <ChevronLeft aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setAnchor((a) => shiftAnchor(view, a, 1))}
                aria-label={t('next')}
              >
                <ChevronRight aria-hidden />
              </Button>
              <Button variant="outline" onClick={() => setAnchor(today)}>
                {t('today')}
              </Button>
            </div>
            <h2 className="min-w-0 flex-1 truncate text-lg font-semibold" aria-live="polite">
              {title}
            </h2>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="lg:hidden"
                  aria-label={t('calendars')}
                >
                  <SlidersHorizontal aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end">{panel('cal-pop')}</PopoverContent>
            </Popover>
            <Tabs value={view} onValueChange={(v) => setView(v as CalendarView)}>
              <TabsList aria-label={t('title')}>
                {VIEWS.map((v) => (
                  <TabsTrigger key={v} value={v}>
                    {t(`views.${v}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {calendarsQuery.isError ? (
            <ErrorState
              error={calendarsQuery.error}
              onRetry={() => void calendarsQuery.refetch()}
            />
          ) : occurrencesQuery.isError ? (
            <ErrorState
              error={occurrencesQuery.error}
              onRetry={() => void occurrencesQuery.refetch()}
            />
          ) : calendarsQuery.isPending || occurrencesQuery.isPending ? (
            <LoadingState rows={6} />
          ) : calendars.length === 0 ? (
            <EmptyState
              icon={<CalendarDays />}
              title={t('noCalendars')}
              description={t('noCalendarsHint')}
              action={
                canWrite ? (
                  <Button onClick={() => setCalendarDialog({ mode: 'create' })}>
                    <Plus aria-hidden />
                    {t('manage.newCalendar')}
                  </Button>
                ) : null
              }
            />
          ) : (
            <div
              aria-busy={occurrencesQuery.isFetching}
              className={
                occurrencesQuery.isPlaceholderData ? 'opacity-70 transition-opacity' : undefined
              }
            >
              {view === 'month' ? (
                <MonthView
                  {...viewProps}
                  month={anchor.slice(0, 7)}
                  onCreate={(d) => openCreate(d)}
                />
              ) : (
                <TimeGridView {...viewProps} timeZone={timeZone} onCreate={openCreate} />
              )}
              {view === 'day' && (byDay.get(anchor)?.length ?? 0) === 0 ? (
                <p className="mt-3 text-center text-sm text-muted">{t('noEvents')}</p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <EventDialog
        state={eventDialog}
        onClose={() => setEventDialog(null)}
        calendars={calendars}
        readOnlyIds={readOnlyIds}
      />
      <CalendarDialog state={calendarDialog} onClose={() => setCalendarDialog(null)} />
    </>
  );
}
