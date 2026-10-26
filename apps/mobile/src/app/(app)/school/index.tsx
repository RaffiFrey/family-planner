import type { GermanState } from '@fp/domain/care';
import type { TimetableEntry } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, addYears } from 'date-fns';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, PartyPopper } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { ModuleGate } from '@/components/gates';
import {
  Button,
  Card,
  ChipSelect,
  DateField,
  Divider,
  EmptyState,
  ErrorState,
  Fab,
  IconButton,
  ListRow,
  LoadingView,
  RowGroup,
  SectionHeader,
  Segmented,
  Text,
} from '@/components/ui';
import { dayKey, parseDayKey } from '@/features/calendar/dates';
import { MemberPicker } from '@/features/health/member-picker';
import { useHousehold, useMembers } from '@/features/household/household';
import {
  defaultSchoolMemberId,
  groupByWeekday,
  upcomingHolidays,
  type WeekFilter,
} from '@/features/school/timetable';
import { useIntlLocale } from '@/i18n';
import { api } from '@/lib/api';
import { showError } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';

const STATES = [
  'BW',
  'BY',
  'BE',
  'BB',
  'HB',
  'HH',
  'HE',
  'MV',
  'NI',
  'NW',
  'RP',
  'SL',
  'SN',
  'ST',
  'SH',
  'TH',
] as const satisfies readonly GermanState[];

type View3 = 'today' | 'week' | 'holidays';

export default function SchoolScreen() {
  return (
    <ModuleGate action="school.read">
      <School />
    </ModuleGate>
  );
}

function School() {
  const { t } = useTranslation();
  const { me, can } = useHousehold();
  const members = useMembers();
  const [memberId, setMemberId] = useState<string | null>(null);
  const selected = memberId ?? defaultSchoolMemberId(members, me.id);
  const [view, setView] = useState<View3>('today');

  return (
    <View className="flex-1 bg-background">
      <View className="gap-3 px-4 pt-4">
        <MemberPicker members={members} value={selected} onChange={setMemberId} />
        <Segmented<View3>
          label={t('m.school.view')}
          value={view}
          onChange={setView}
          options={[
            { value: 'today', label: t('m.school.today') },
            { value: 'week', label: t('m.school.week') },
            { value: 'holidays', label: t('m.school.holidays') },
          ]}
        />
      </View>
      {view === 'today' ? <DayView memberId={selected} /> : null}
      {view === 'week' ? <WeekView memberId={selected} /> : null}
      {view === 'holidays' ? <HolidaysView /> : null}
      {can('school.write') && view !== 'holidays' ? (
        <Fab
          label={t('m.school.addLesson')}
          onPress={() => {
            router.push({ pathname: '/school/lesson', params: { memberId: selected } });
          }}
        />
      ) : null}
    </View>
  );
}

function LessonRow({ entry }: { entry: TimetableEntry }) {
  const { t } = useTranslation();
  const { can } = useHousehold();
  const details = [
    `${entry.startTime}–${entry.endTime}`,
    entry.room ? t('m.school.roomShort', { room: entry.room }) : null,
    entry.teacher,
    entry.week ? t('m.school.weekOnly', { week: entry.week }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <ListRow
      title={entry.subject}
      subtitle={details}
      left={
        <View className="h-9 w-9 items-center justify-center rounded-full bg-surface-muted">
          <Text
            className="font-semibold"
            accessibilityLabel={t('m.school.periodLabel', { period: entry.period })}
          >
            {entry.period}
          </Text>
        </View>
      }
      {...(can('school.write')
        ? {
            chevron: true,
            onPress: () => {
              router.push({
                pathname: '/school/lesson',
                params: { memberId: entry.memberId, entryId: entry.id },
              });
            },
          }
        : {})}
    />
  );
}

function DayView({ memberId }: { memberId: string }) {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const { householdId } = useHousehold();
  const [date, setDate] = useState(() => new Date());
  const key = dayKey(date);
  const day = useQuery({
    queryKey: ['school', 'timetable.day', { householdId, memberId, date: key }],
    queryFn: () => api.school.timetable.day({ params: { householdId, memberId, date: key } }),
  });
  const isToday = key === dayKey(new Date());
  const label = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);

  return (
    <ScrollView
      contentContainerClassName="gap-4 p-4 pb-28"
      refreshControl={
        <RefreshControl refreshing={day.isRefetching} onRefresh={() => void day.refetch()} />
      }
    >
      <View className="flex-row items-center justify-between">
        <IconButton
          label={t('m.school.previousDay')}
          onPress={() => {
            setDate(addDays(date, -1));
          }}
        >
          <ChevronLeft size={22} color={colors.text} />
        </IconButton>
        <View className="items-center">
          <Text variant="subheading" accessibilityRole="header">
            {isToday ? t('m.school.todayLabel', { date: label }) : label}
          </Text>
          {day.data?.week ? (
            <Text variant="caption">{t('m.school.weekLabel', { week: day.data.week })}</Text>
          ) : null}
        </View>
        <IconButton
          label={t('m.school.nextDay')}
          onPress={() => {
            setDate(addDays(date, 1));
          }}
        >
          <ChevronRight size={22} color={colors.text} />
        </IconButton>
      </View>
      {!isToday ? (
        <Button
          variant="ghost"
          size="sm"
          title={t('m.school.backToToday')}
          onPress={() => {
            setDate(new Date());
          }}
        />
      ) : null}
      {day.isPending ? (
        <LoadingView />
      ) : day.error && !day.data ? (
        <ErrorState error={day.error} onRetry={() => void day.refetch()} />
      ) : day.data.holiday ? (
        <Card className="items-center">
          <PartyPopper size={28} color={colors.primary} />
          <Text variant="subheading" className="text-center">
            {t('m.school.holidayToday', { name: day.data.holiday })}
          </Text>
        </Card>
      ) : day.data.entries.length === 0 ? (
        <EmptyState title={t('m.school.noLessons')} />
      ) : (
        <RowGroup>
          {day.data.entries.map((e, i) => (
            <View key={e.id}>
              {i > 0 ? <Divider /> : null}
              <LessonRow entry={e} />
            </View>
          ))}
        </RowGroup>
      )}
    </ScrollView>
  );
}

function WeekView({ memberId }: { memberId: string }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const { householdId } = useHousehold();
  const [week, setWeek] = useState<WeekFilter>('all');
  const list = useQuery({
    queryKey: ['school', 'timetable.list', { householdId, memberId }],
    queryFn: () => api.school.timetable.list({ params: { householdId }, query: { memberId } }),
  });
  // 2026-10-26 is a Monday: weekday names via Intl.
  const weekdayName = (iso: number) =>
    new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(2026, 9, 25 + iso));

  if (list.isPending) return <LoadingView />;
  if (list.error && !list.data)
    return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  const hasAB = list.data.some((e) => e.week !== null);
  const groups = groupByWeekday(list.data, week);

  return (
    <ScrollView
      contentContainerClassName="gap-3 p-4 pb-28"
      refreshControl={
        <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
      }
    >
      {list.data.length === 0 ? (
        <EmptyState title={t('m.school.noTimetable')} message={t('m.school.noTimetableHint')} />
      ) : (
        <>
          {hasAB ? (
            <ChipSelect<WeekFilter>
              label={t('m.school.abWeek')}
              value={week}
              onChange={setWeek}
              options={[
                { value: 'all', label: t('common.all') },
                { value: 'A', label: t('m.school.weekLabel', { week: 'A' }) },
                { value: 'B', label: t('m.school.weekLabel', { week: 'B' }) },
              ]}
            />
          ) : null}
          {groups.map((g) => (
            <View key={g.weekday} className="gap-2">
              <SectionHeader title={weekdayName(g.weekday)} />
              {g.entries.length === 0 ? (
                <Text variant="caption">{t('m.school.free')}</Text>
              ) : (
                <RowGroup>
                  {g.entries.map((e, i) => (
                    <View key={e.id}>
                      {i > 0 ? <Divider /> : null}
                      <LessonRow entry={e} />
                    </View>
                  ))}
                </RowGroup>
              )}
            </View>
          ))}
        </>
      )}
      <AbWeekSetting />
    </ScrollView>
  );
}

/** Which calendar weeks count as "A" (any date in an A week); B alternates. */
function AbWeekSetting() {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const { householdId, can } = useHousehold();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ['school', 'settings', { householdId }],
    queryFn: () => api.school.settings({ params: { householdId } }),
  });
  const update = useMutation({
    mutationFn: (anchor: string | null) =>
      api.school.updateSettings({ params: { householdId }, body: { abWeekAnchor: anchor } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['school'] }),
    onError: (e) => {
      showError(e, t);
    },
  });
  if (!settings.data) return null;
  const anchor = settings.data.abWeekAnchor;
  const anchorDate = anchor ? parseDayKey(anchor) : null;
  return (
    <Card>
      <Text variant="subheading">{t('m.school.abWeek')}</Text>
      <Text variant="caption">
        {anchorDate
          ? t('m.school.abAnchorCurrent', {
              date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(anchorDate),
            })
          : t('m.school.abAnchorNone')}
      </Text>
      {can('school.write') ? (
        <DateField
          label={t('m.school.abAnchor')}
          value={anchorDate}
          clearable
          onChange={(d) => {
            update.mutate(d ? dayKey(d) : null);
          }}
        />
      ) : null}
    </Card>
  );
}

function HolidaysView() {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const { householdId, can } = useHousehold();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ['school', 'settings', { householdId }],
    queryFn: () => api.school.settings({ params: { householdId } }),
  });
  const [changing, setChanging] = useState(false);
  const today = dayKey(new Date());
  const to = dayKey(addYears(new Date(), 1));
  const state = settings.data?.state ?? null;
  const holidays = useQuery({
    queryKey: ['school', 'holidays', { householdId, state, from: today }],
    queryFn: () => api.school.holidays({ params: { householdId }, query: { from: today, to } }),
    enabled: state !== null,
    staleTime: 24 * 60 * 60_000,
  });
  const update = useMutation({
    mutationFn: (s: GermanState) =>
      api.school.updateSettings({ params: { householdId }, body: { state: s } }),
    onSuccess: async () => {
      setChanging(false);
      await queryClient.invalidateQueries({ queryKey: ['school'] });
    },
    onError: (e) => {
      showError(e, t);
    },
  });
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const fmtDay = (k: string) => fmt.format(new Date(`${k}T12:00:00`));

  if (settings.isPending) return <LoadingView />;
  if (settings.error && !settings.data)
    return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;

  const picker =
    can('school.write') && (state === null || changing) ? (
      <ChipSelect<GermanState>
        label={t('m.school.state')}
        value={state}
        onChange={(s) => {
          update.mutate(s);
        }}
        options={STATES.map((s) => ({ value: s, label: t(`m.school.states.${s}`) }))}
      />
    ) : null;

  return (
    <ScrollView contentContainerClassName="gap-4 p-4 pb-12">
      {state === null ? (
        <>
          <EmptyState title={t('m.school.noState')} message={t('m.school.noStateHint')} />
          {picker}
        </>
      ) : (
        <>
          <View className="flex-row items-center justify-between gap-2">
            <Text variant="subheading" className="flex-1">
              {t(`m.school.states.${state}`)}
            </Text>
            {can('school.write') ? (
              <Button
                size="sm"
                variant="ghost"
                title={changing ? t('common.cancel') : t('m.school.changeState')}
                onPress={() => {
                  setChanging(!changing);
                }}
              />
            ) : null}
          </View>
          {picker}
          {holidays.isPending ? (
            <LoadingView />
          ) : holidays.error && !holidays.data ? (
            <ErrorState error={holidays.error} onRetry={() => void holidays.refetch()} />
          ) : (
            <>
              {!holidays.data.complete ? (
                <Text variant="caption">{t('m.school.holidaysIncomplete')}</Text>
              ) : null}
              {upcomingHolidays(holidays.data.holidays, today).length === 0 ? (
                <EmptyState title={t('m.school.noHolidays')} />
              ) : (
                <RowGroup>
                  {upcomingHolidays(holidays.data.holidays, today).map((h, i) => (
                    <View key={`${h.name}-${h.start}`}>
                      {i > 0 ? <Divider /> : null}
                      <ListRow
                        title={h.name}
                        subtitle={`${fmtDay(h.start)} – ${fmtDay(h.end)}${h.current ? ` · ${t('m.school.now')}` : ''}`}
                      />
                    </View>
                  ))}
                </RowGroup>
              )}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
