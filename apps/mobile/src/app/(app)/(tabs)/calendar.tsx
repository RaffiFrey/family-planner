import { addMonths, isSameMonth, startOfMonth } from 'date-fns';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { type ComponentRef, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import {
  EmptyState,
  ErrorState,
  Fab,
  IconButton,
  LoadingView,
  RowGroup,
  Text,
} from '@/components/ui';
import { dayKey, monthDays, monthRange, parseDayKey } from '@/features/calendar/dates';
import { useCalendars, useOccurrences, useOccurrencesByDay } from '@/features/calendar/hooks';
import { OccurrenceRow } from '@/features/calendar/occurrence-row';
import { useHousehold } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { useColors } from '@/lib/theme';
import { useNow } from '@/lib/use-now';

const DAY_PILL_WIDTH = 52;

/** Month strip (tap a day) above an agenda of that day and the rest of the month. */
export default function CalendarScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const { can } = useHousehold();
  const now = useNow();
  const todayKey = dayKey(now);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(todayKey);
  const strip = useRef<ComponentRef<typeof ScrollView>>(null);

  const range = useMemo(() => {
    const r = monthRange(month);
    return { from: r.from.toISOString(), to: r.to.toISOString() };
  }, [month]);
  const occurrences = useOccurrences(range.from, range.to);
  const calendars = useCalendars();
  const byDay = useOccurrencesByDay(occurrences.data);
  const calendarById = useMemo(
    () => new Map((calendars.data ?? []).map((c) => [c.id, c])),
    [calendars.data],
  );
  const days = monthDays(month);
  const selectedInMonth = days.some((d) => dayKey(d) === selected)
    ? selected
    : dayKey(days[0] ?? month);
  const agendaDays = days
    .map(dayKey)
    .filter((k) => k >= selectedInMonth && (byDay.get(k)?.length ?? 0) > 0);

  const changeMonth = (delta: number) => {
    const next = addMonths(month, delta);
    setMonth(next);
    setSelected(isSameMonth(next, now) ? todayKey : dayKey(next));
    strip.current?.scrollTo({ x: 0, animated: false });
  };

  const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const headingFmt = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between px-2 pt-2">
        <IconButton
          label={t('m.common.previousMonth')}
          onPress={() => {
            changeMonth(-1);
          }}
        >
          <ChevronLeft size={22} color={colors.text} />
        </IconButton>
        <Pressable
          accessibilityRole="button"
          accessibilityHint={t('m.calendar.jumpToToday')}
          onPress={() => {
            setMonth(startOfMonth(now));
            setSelected(todayKey);
          }}
        >
          <Text variant="heading">
            {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month)}
          </Text>
        </Pressable>
        <IconButton
          label={t('m.common.nextMonth')}
          onPress={() => {
            changeMonth(1);
          }}
        >
          <ChevronRight size={22} color={colors.text} />
        </IconButton>
      </View>
      <ScrollView
        ref={strip}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-1 px-3 py-2"
        className="max-h-24 grow-0"
        onLayout={() => {
          const idx = days.findIndex((d) => dayKey(d) === selectedInMonth);
          if (idx > 3)
            strip.current?.scrollTo({ x: (idx - 3) * (DAY_PILL_WIDTH + 4), animated: false });
        }}
      >
        {days.map((d) => {
          const key = dayKey(d);
          const isSelected = key === selectedInMonth;
          const isToday = key === todayKey;
          const count = byDay.get(key)?.length ?? 0;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${headingFmt.format(d)}, ${t('m.calendar.eventCount', { count })}`}
              onPress={() => {
                setSelected(key);
              }}
              style={{ width: DAY_PILL_WIDTH }}
              className={`items-center gap-0.5 rounded-lg py-2 ${isSelected ? 'bg-primary' : isToday ? 'border border-primary' : 'bg-surface'}`}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                className={`text-xs ${isSelected ? 'text-primary-text' : 'text-muted'}`}
              >
                {weekdayFmt.format(d)}
              </Text>
              <Text
                maxFontSizeMultiplier={1.3}
                className={`text-lg font-semibold ${isSelected ? 'text-primary-text' : 'text-text'}`}
              >
                {d.getDate()}
              </Text>
              <View
                className={`h-1.5 w-1.5 rounded-full ${count > 0 ? (isSelected ? 'bg-primary-text' : 'bg-primary') : 'bg-transparent'}`}
              />
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-28"
        refreshControl={
          <RefreshControl
            refreshing={occurrences.isRefetching}
            onRefresh={() => void occurrences.refetch()}
          />
        }
      >
        {occurrences.isPending ? (
          <LoadingView />
        ) : occurrences.error && !occurrences.data ? (
          <ErrorState error={occurrences.error} onRetry={() => void occurrences.refetch()} />
        ) : agendaDays.length === 0 ? (
          <EmptyState title={t('m.calendar.noEvents')} />
        ) : (
          agendaDays.map((key) => (
            <View key={key} className="gap-2">
              <Text
                variant="subheading"
                accessibilityRole="header"
                className={key === todayKey ? 'text-primary' : ''}
              >
                {key === todayKey ? `${t('common.today')}, ` : ''}
                {headingFmt.format(parseDayKey(key))}
              </Text>
              <RowGroup>
                {(byDay.get(key) ?? []).map((o) => (
                  <OccurrenceRow
                    key={`${o.eventId}-${o.originalStart}`}
                    occurrence={o}
                    calendar={calendarById.get(o.calendarId)}
                  />
                ))}
              </RowGroup>
            </View>
          ))
        )}
      </ScrollView>
      {can('calendar.write') ? (
        <Fab
          label={t('m.calendar.newEvent')}
          onPress={() => {
            router.push({ pathname: '/events/new', params: { date: selectedInMonth } });
          }}
        />
      ) : null}
    </View>
  );
}
