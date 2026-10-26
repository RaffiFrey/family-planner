import { addDays, startOfDay } from 'date-fns';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Sparkles } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import {
  Button,
  Card,
  IconButton,
  EmptyState,
  ErrorState,
  LoadingView,
  RowGroup,
  SectionHeader,
  Text,
} from '@/components/ui';
import { dayKey } from '@/features/calendar/dates';
import { useCalendars, useOccurrences, useOccurrencesByDay } from '@/features/calendar/hooks';
import { OccurrenceRow } from '@/features/calendar/occurrence-row';
import { BudgetLine } from '@/features/finance/budget-card';
import { useOverview } from '@/features/finance/hooks';
import { useHousehold } from '@/features/household/household';
import { useTasks } from '@/features/tasks/hooks';
import { TaskRow } from '@/features/tasks/task-row';
import { useIntlLocale } from '@/i18n';
import { useColors } from '@/lib/theme';
import { useNow } from '@/lib/use-now';

/** Today at a glance: events, due and overdue chores, budget levels. */
export default function HomeScreen() {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const colors = useColors();
  const { me, household, can } = useHousehold();
  const now = useNow();
  const today = dayKey(now);
  const range = useMemo(() => {
    const from = startOfDay(new Date(`${today}T12:00:00`));
    return { from: from.toISOString(), to: addDays(from, 1).toISOString() };
  }, [today]);
  const occurrences = useOccurrences(range.from, range.to);
  const calendars = useCalendars();
  const byDay = useOccurrencesByDay(occurrences.data);
  const todays = byDay.get(today) ?? [];
  const tasks = useTasks('open', range.to);
  const showFinance = can('finance.read');
  const overview = useOverview(showFinance);
  const calendarById = new Map((calendars.data ?? []).map((c) => [c.id, c]));
  const budgets = (overview.data?.budgets ?? [])
    .slice()
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 4);

  const refreshing = occurrences.isRefetching || tasks.isRefetching || overview.isRefetching;
  const refresh = () => {
    void occurrences.refetch();
    void tasks.refetch();
    if (showFinance) void overview.refetch();
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      {can('assistant.write') ? (
        <Tabs.Screen
          options={{
            headerRight: () => (
              <IconButton
                label={t('m.assistant.quickCapture')}
                className="mr-2"
                onPress={() => {
                  router.push('/assistant');
                }}
              >
                <Sparkles size={22} color={colors.primary} />
              </IconButton>
            ),
          }}
        />
      ) : null}
      <View className="gap-0.5">
        <Text variant="title">{t('m.home.greeting', { name: me.displayName })}</Text>
        <Text variant="caption">
          {new Intl.DateTimeFormat(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }).format(now)}{' '}
          · {household.name}
        </Text>
      </View>

      <SectionHeader
        title={t('m.home.todayEvents')}
        action={
          <Button
            size="sm"
            variant="ghost"
            title={t('nav.calendar')}
            onPress={() => {
              router.navigate('/calendar');
            }}
          />
        }
      />
      {occurrences.isPending ? (
        <LoadingView />
      ) : occurrences.error && !occurrences.data ? (
        <ErrorState error={occurrences.error} onRetry={() => void occurrences.refetch()} />
      ) : todays.length === 0 ? (
        <Card>
          <Text variant="caption">{t('m.home.noEventsToday')}</Text>
        </Card>
      ) : (
        <RowGroup>
          {todays.map((o) => (
            <OccurrenceRow
              key={`${o.eventId}-${o.originalStart}`}
              occurrence={o}
              calendar={calendarById.get(o.calendarId)}
            />
          ))}
        </RowGroup>
      )}

      <SectionHeader
        title={t('m.home.dueTasks')}
        action={
          <Button
            size="sm"
            variant="ghost"
            title={t('nav.tasks')}
            onPress={() => {
              router.navigate('/tasks');
            }}
          />
        }
      />
      {tasks.isPending ? (
        <LoadingView />
      ) : tasks.error && !tasks.data ? (
        <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
      ) : tasks.data.length === 0 ? (
        <EmptyState title={t('m.tasks.allDone')} />
      ) : (
        <RowGroup>
          {tasks.data
            .slice()
            .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
            .map((task) => (
              <TaskRow key={task.id} task={task} now={now} />
            ))}
        </RowGroup>
      )}

      {showFinance ? (
        <>
          <SectionHeader
            title={t('m.home.budgets')}
            action={
              <Button
                size="sm"
                variant="ghost"
                title={t('nav.finance')}
                onPress={() => {
                  router.push('/finance/budgets');
                }}
              />
            }
          />
          {overview.isPending ? (
            <LoadingView />
          ) : overview.error && !overview.data ? (
            <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
          ) : budgets.length === 0 ? (
            <Card>
              <Text variant="caption">{t('m.finance.noBudgets')}</Text>
            </Card>
          ) : (
            <Card className="gap-4">
              {budgets.map((b) => (
                <BudgetLine key={b.budget.id} status={b} />
              ))}
            </Card>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}
