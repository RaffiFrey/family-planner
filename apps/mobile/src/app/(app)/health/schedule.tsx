import { useQueries } from '@tanstack/react-query';
import { addDays, startOfDay } from 'date-fns';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Pill } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import {
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingView,
  RowGroup,
  SectionHeader,
  Segmented,
} from '@/components/ui';
import { dayKey } from '@/features/calendar/dates';
import { useMedications } from '@/features/health/hooks';
import { groupIntakesByDay, type Intake } from '@/features/health/intakes';
import { useHousehold, useMemberMap } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { api } from '@/lib/api';
import { useColors } from '@/lib/theme';
import { useNow } from '@/lib/use-now';

type Range = 'today' | 'week';

/** Intake plan of one member for today or the next 7 days (from the schedule endpoint). */
export default function MedicationScheduleScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const { householdId } = useHousehold();
  const member = useMemberMap().get(memberId);
  const now = useNow();
  const [range, setRange] = useState<Range>('today');
  const medications = useMedications(memberId);
  const from = startOfDay(now);
  const to = addDays(from, range === 'today' ? 1 : 7);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const schedules = useQueries({
    queries: (medications.data ?? []).map((m) => ({
      queryKey: [
        'health',
        'medications.schedule',
        { householdId, medicationId: m.id, from: fromIso, to: toIso },
      ],
      queryFn: () =>
        api.health.medications.schedule({
          params: { householdId, medicationId: m.id },
          query: { from: fromIso, to: toIso },
        }),
    })),
  });

  const pending = medications.isPending || schedules.some((s) => s.isPending);
  const failed = schedules.find((s) => s.error && !s.data);
  const intakes = useMemo<Intake[]>(
    () =>
      (medications.data ?? []).flatMap((m, i) =>
        (schedules[i]?.data ?? []).map((s) => ({
          at: s.at,
          time: s.time,
          medicationId: m.id,
          name: m.name,
          dose: m.dose,
        })),
      ),
    [medications.data, schedules],
  );
  const groups = groupIntakesByDay(intakes);
  const dayFmt = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const todayKey = dayKey(now);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      refreshControl={
        <RefreshControl
          refreshing={medications.isRefetching}
          onRefresh={() => {
            void medications.refetch();
            for (const s of schedules) void s.refetch();
          }}
        />
      }
    >
      <Stack.Screen
        options={{ title: t('m.health.scheduleFor', { name: member?.displayName ?? '' }) }}
      />
      <Segmented<Range>
        label={t('m.health.scheduleRange')}
        value={range}
        onChange={setRange}
        options={[
          { value: 'today', label: t('m.health.scheduleToday') },
          { value: 'week', label: t('m.health.scheduleWeek') },
        ]}
      />
      {pending ? (
        <LoadingView />
      ) : medications.error && !medications.data ? (
        <ErrorState error={medications.error} onRetry={() => void medications.refetch()} />
      ) : failed ? (
        <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState title={t('m.health.noIntakes')} />
      ) : (
        groups.map((g) => (
          <View key={g.day} className="gap-2">
            <SectionHeader
              title={
                g.day === todayKey
                  ? t('m.health.todayDate', {
                      date: dayFmt.format(new Date(g.intakes[0]?.at ?? g.day)),
                    })
                  : dayFmt.format(new Date(g.intakes[0]?.at ?? g.day))
              }
            />
            <RowGroup>
              {g.intakes.map((i, idx) => {
                const past = new Date(i.at) < now;
                return (
                  <View key={`${i.medicationId}-${i.at}`}>
                    {idx > 0 ? <Divider /> : null}
                    <ListRow
                      title={`${timeFmt.format(new Date(i.at))} · ${i.name}`}
                      subtitle={
                        [i.dose, past ? t('m.health.intakePast') : null]
                          .filter(Boolean)
                          .join(' · ') || null
                      }
                      left={<Pill size={20} color={past ? colors.textMuted : colors.primary} />}
                    />
                  </View>
                );
              })}
            </RowGroup>
          </View>
        ))
      )}
    </ScrollView>
  );
}
