'use client';

import { GermanState, type TimetableEntry } from '@fp/contracts';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  TreePalm,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { ModuleGate } from '@/components/upsell';
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
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { MemberSwitcher } from '@/features/health/health-page';
import { addDaysIso, todayIso, weekdayNames } from '@/features/health/dates';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';
import { LessonDialog, type LessonDraft } from './lesson-dialog';

/** Monday of the week containing `iso`. */
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDaysIso(iso, -dow);
}

export function SchoolPage() {
  const t = useTranslations('school');
  const { members, member: me } = useHousehold();
  const pupils = members.filter((m) => m.role === 'child' || m.role === 'teen');
  const choices = pupils.length > 0 ? pupils : members;
  const [memberId, setMemberId] = React.useState((choices[0] ?? me).id);
  const selected = members.find((m) => m.id === memberId) ?? me;

  return (
    <ModuleGate action="school.read">
      <PageHeader title={t('title')} description={t('description')} />
      <div className="grid gap-6">
        <MemberSwitcher
          label={t('member')}
          members={members}
          value={selected.id}
          onChange={setMemberId}
        />
        <Timetable memberId={selected.id} memberName={selected.displayName} />
        <div className="grid gap-6 lg:grid-cols-2">
          <SettingsCard />
          <HolidaysCard />
        </div>
      </div>
    </ModuleGate>
  );
}

function Timetable({ memberId, memberName }: { memberId: string; memberName: string }) {
  const t = useTranslations('school');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const locale = useLocale();
  const fmt = useFormat();
  const { householdId, can } = useHousehold();
  const canWrite = can('school.write');
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const dayNames = weekdayNames(locale);
  const longDayNames = weekdayNames(locale, 'long');
  const [weekStart, setWeekStart] = React.useState(() => mondayOf(todayIso()));
  const [draft, setDraft] = React.useState<LessonDraft | null>(null);
  const [deleting, setDeleting] = React.useState<TimetableEntry | null>(null);

  const list = useQuery({
    queryKey: ['school', 'timetable.list', householdId, memberId],
    queryFn: () => api.school.timetable.list({ params: { householdId }, query: { memberId } }),
  });
  const entries = list.data ?? [];
  const showWeekend = entries.some((e) => e.weekday >= 6);
  const dayCount = showWeekend ? 7 : 5;
  const dates = Array.from({ length: dayCount }, (_, i) => addDaysIso(weekStart, i));
  const days = useQueries({
    queries: dates.map((date) => ({
      queryKey: ['school', 'timetable.day', householdId, memberId, date],
      queryFn: () => api.school.timetable.day({ params: { householdId, memberId, date } }),
    })),
  });

  const remove = useMutation({
    mutationFn: (e: TimetableEntry) =>
      api.school.timetable.remove({ params: { householdId, entryId: e.id } }),
    onSuccess: async () => {
      setDeleting(null);
      toast.success(t('lessons.deleted'));
      await queryClient.invalidateQueries({ queryKey: ['school'] });
    },
    onError: toastError,
  });

  const periods = [...new Set(entries.map((e) => e.period))].sort((a, b) => a - b);
  const periodTimes = new Map<number, string>();
  for (const e of entries)
    if (!periodTimes.has(e.period)) periodTimes.set(e.period, `${e.startTime}–${e.endTime}`);
  const weekLabel = days.find((d) => d.data?.week)?.data?.week ?? null;
  const today = todayIso();

  const addButton = canWrite ? (
    <Button onClick={() => setDraft({ memberId })}>
      <Plus aria-hidden />
      {t('lessons.add')}
    </Button>
  ) : null;

  if (list.isPending) return <LoadingState rows={5} />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;

  return (
    <section className="grid gap-4" aria-labelledby="timetable-heading">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="timetable-heading" className="sr-only">
          {t('grid.caption', { name: memberName })}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('week.previous')}
            onClick={() => setWeekStart((w) => addDaysIso(w, -7))}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekStart(mondayOf(todayIso()))}>
            {t('week.current')}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('week.next')}
            onClick={() => setWeekStart((w) => addDaysIso(w, 7))}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <p className="text-sm font-medium" aria-live="polite">
          {t('week.label', {
            from: fmt.date(weekStart, { day: 'numeric', month: 'short' }),
            to: fmt.date(addDaysIso(weekStart, dayCount - 1), { day: 'numeric', month: 'short' }),
          })}
        </p>
        {weekLabel ? (
          <Badge variant="default">{weekLabel === 'A' ? t('week.a') : t('week.b')}</Badge>
        ) : null}
        <div className="ml-auto">{entries.length > 0 ? addButton : null}</div>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={<GraduationCap />}
          title={t('lessons.empty')}
          description={t('lessons.emptyHint')}
          action={addButton}
        />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[40rem] table-fixed border-separate border-spacing-1 text-sm">
            <caption className="sr-only">{t('grid.caption', { name: memberName })}</caption>
            <thead>
              <tr>
                <th scope="col" className="w-20 text-left text-xs font-medium text-muted">
                  {t('grid.period')}
                </th>
                {dates.map((date, i) => (
                  <th
                    key={date}
                    scope="col"
                    className={cn(
                      'rounded-md px-2 py-1 text-left font-medium',
                      date === today && 'bg-primary/10 text-primary',
                    )}
                  >
                    <abbr title={longDayNames[i]} className="no-underline">
                      {dayNames[i]}
                    </abbr>{' '}
                    <span className="text-xs text-muted">
                      {fmt.date(date, { day: 'numeric', month: 'numeric' })}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((period, rowIdx) => (
                <tr key={period}>
                  <th scope="row" className="align-top text-left font-normal">
                    <span className="font-medium">{period}.</span>
                    <span className="block text-[11px] text-muted tabular-nums">
                      {periodTimes.get(period)}
                    </span>
                  </th>
                  {dates.map((date, i) => {
                    const day = days[i];
                    if (day?.isPending)
                      return (
                        <td key={date}>
                          <div className="h-14 animate-pulse rounded-md bg-surface-muted" />
                        </td>
                      );
                    const holiday = day?.data?.holiday;
                    if (holiday) {
                      return rowIdx === 0 ? (
                        <td
                          key={date}
                          rowSpan={periods.length}
                          className="rounded-md bg-success/10 p-2 align-top text-success"
                        >
                          <TreePalm className="mb-1 size-4" aria-hidden />
                          <span className="text-xs font-medium">
                            {t('grid.holiday', { name: holiday })}
                          </span>
                        </td>
                      ) : null;
                    }
                    const lessons = (day?.data?.entries ?? []).filter((e) => e.period === period);
                    if (lessons.length === 0) {
                      return (
                        <td
                          key={date}
                          className="h-14 rounded-md border border-dashed border-border"
                        >
                          {canWrite ? (
                            <button
                              type="button"
                              className="size-full min-h-14 rounded-md text-muted opacity-0 outline-none hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary"
                              aria-label={t('grid.addLesson', {
                                day: longDayNames[i] ?? '',
                                period,
                              })}
                              onClick={() =>
                                setDraft({
                                  memberId,
                                  weekday: i + 1,
                                  period,
                                  startTime: periodTimes.get(period)?.split('–')[0],
                                  endTime: periodTimes.get(period)?.split('–')[1],
                                })
                              }
                            >
                              <Plus className="mx-auto size-4" aria-hidden />
                            </button>
                          ) : (
                            <span className="sr-only">{t('grid.free')}</span>
                          )}
                        </td>
                      );
                    }
                    return (
                      <td key={date} className="align-top">
                        {lessons.map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            disabled={!canWrite}
                            onClick={() => setDraft({ memberId, entry: l })}
                            className="mb-1 block w-full rounded-md border border-primary/30 bg-primary/10 p-1.5 text-left outline-none last:mb-0 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default"
                          >
                            <span className="block truncate font-medium">{l.subject}</span>
                            <span className="block truncate text-[11px] text-muted">
                              {[l.room, l.teacher].filter(Boolean).join(' · ')}
                              {l.week ? ` · ${l.week}` : ''}
                            </span>
                          </button>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {entries.length > 0 ? (
        <details className="rounded-lg border border-border bg-surface p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {t('lessons.title')} ({entries.length})
          </summary>
          <ul className="mt-2 grid gap-1">
            {[...entries]
              .sort((a, b) => a.weekday - b.weekday || a.period - b.period)
              .map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <span className="w-28 shrink-0 text-muted">
                    {dayNames[e.weekday - 1]}, {t('lessons.nth', { period: e.period })}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {e.subject}
                    {e.room ? ` · ${e.room}` : ''}
                  </span>
                  {e.week ? <Badge variant="outline">{e.week}</Badge> : null}
                  {canWrite ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={tu('actions')}>
                          <MoreVertical aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setDraft({ memberId, entry: e })}>
                          <Pencil aria-hidden />
                          {tc('edit')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(e)}>
                          <Trash2 aria-hidden />
                          {tc('delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </li>
              ))}
          </ul>
        </details>
      ) : null}

      <LessonDialog
        draft={draft}
        onClose={() => setDraft(null)}
        onDelete={(e) => {
          setDraft(null);
          setDeleting(e);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('lessons.deleteTitle', { subject: deleting?.subject ?? '' })}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </section>
  );
}

function SettingsCard() {
  const t = useTranslations('school');
  const tc = useTranslations('common');
  const { householdId, can } = useHousehold();
  const canWrite = can('school.write');
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const query = useQuery({
    queryKey: ['school', 'settings', householdId],
    queryFn: () => api.school.settings({ params: { householdId } }),
  });
  const { register, handleSubmit, reset } = useForm<{ state: string; anchor: string }>({
    defaultValues: { state: '', anchor: '' },
  });
  React.useEffect(() => {
    if (query.data) reset({ state: query.data.state ?? '', anchor: query.data.abWeekAnchor ?? '' });
  }, [query.data, reset]);

  const mutation = useMutation({
    mutationFn: (v: { state: string; anchor: string }) =>
      api.school.updateSettings({
        params: { householdId },
        body: {
          state: v.state ? GermanState.parse(v.state) : null,
          abWeekAnchor: v.anchor || null,
        },
      }),
    onSuccess: async () => {
      toast.success(t('settings.saved'));
      await queryClient.invalidateQueries({ queryKey: ['school'] });
    },
    onError: toastError,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <LoadingState rows={2} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <form
            onSubmit={(e) => void handleSubmit((v) => mutation.mutate(v))(e)}
            className="grid gap-4"
          >
            <Field label={t('settings.state')}>
              {(p) => (
                <NativeSelect {...p} disabled={!canWrite} {...register('state')}>
                  <option value="">{t('settings.noState')}</option>
                  {GermanState.options.map((s) => (
                    <option key={s} value={s}>
                      {t(`states.${s}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('settings.anchor')} hint={t('settings.anchorHint')}>
              {(p) => <Input {...p} type="date" disabled={!canWrite} {...register('anchor')} />}
            </Field>
            {canWrite ? (
              <div>
                <Button type="submit" loading={mutation.isPending}>
                  {tc('save')}
                </Button>
              </div>
            ) : null}
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function HolidaysCard() {
  const t = useTranslations('school');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const settings = useQuery({
    queryKey: ['school', 'settings', householdId],
    queryFn: () => api.school.settings({ params: { householdId } }),
  });
  const from = todayIso();
  const to = addDaysIso(from, 365);
  const state = settings.data?.state ?? null;
  const query = useQuery({
    queryKey: ['school', 'holidays', householdId, state, from],
    queryFn: () => api.school.holidays({ params: { householdId }, query: { from, to } }),
    enabled: state !== null,
    staleTime: 60 * 60_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('holidays.title')}
          {state ? <span className="font-normal text-muted"> · {t(`states.${state}`)}</span> : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {settings.isPending ? (
          <LoadingState rows={2} />
        ) : !state ? (
          <p className="text-sm text-muted">{t('holidays.pickState')}</p>
        ) : query.isPending ? (
          <LoadingState rows={3} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <div className="grid gap-2">
            {!query.data.complete ? (
              <p role="status" className="text-xs text-warning">
                {t('holidays.incomplete')}
              </p>
            ) : null}
            {query.data.holidays.length === 0 ? (
              <p className="text-sm text-muted">{t('holidays.empty')}</p>
            ) : (
              <ul className="grid gap-1">
                {query.data.holidays.map((h) => {
                  const now = h.start <= from && h.end >= from;
                  return (
                    <li
                      key={`${h.name}-${h.start}`}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span className="font-medium">
                        {h.name}
                        {now ? (
                          <Badge variant="success" className="ml-2">
                            {t('holidays.now')}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="text-muted tabular-nums">
                        {t('holidays.range', { from: fmt.date(h.start), to: fmt.date(h.end) })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
