import type { TimetableEntry } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, ChipSelect, LoadingView, ScreenScroll, Text, TextField } from '@/components/ui';
import { parseTimes } from '@/features/health/schedule';
import { useHousehold, useMemberMap } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { api } from '@/lib/api';
import { confirmAsync } from '@/lib/dialogs';
import { errorMessage, FormError } from '@/lib/errors';

export default function LessonScreen() {
  const { memberId, entryId } = useLocalSearchParams<{ memberId: string; entryId?: string }>();
  const { householdId } = useHousehold();
  const list = useQuery({
    queryKey: ['school', 'timetable.list', { householdId, memberId }],
    queryFn: () => api.school.timetable.list({ params: { householdId }, query: { memberId } }),
    enabled: !!entryId,
  });
  if (entryId && list.isPending) return <LoadingView />;
  const entry = entryId ? list.data?.find((e) => e.id === entryId) : undefined;
  return <LessonForm key={entry?.id ?? 'new'} memberId={memberId} entry={entry} />;
}

type WeekChoice = 'all' | 'A' | 'B';
const WEEKDAY_VALUES = ['1', '2', '3', '4', '5', '6', '7'] as const;

function oneTime(v: string): string | null {
  const parsed = parseTimes(v);
  return parsed?.length === 1 ? (parsed[0] ?? null) : null;
}

function LessonForm({ memberId, entry }: { memberId: string; entry: TimetableEntry | undefined }) {
  const { t } = useTranslation();
  const { householdId } = useHousehold();
  const member = useMemberMap().get(memberId);
  const locale = useIntlLocale();
  const queryClient = useQueryClient();
  const [weekday, setWeekday] = useState<string>(String(entry?.weekday ?? 1));
  const [period, setPeriod] = useState(String(entry?.period ?? 1));
  const [start, setStart] = useState(entry?.startTime ?? '08:00');
  const [end, setEnd] = useState(entry?.endTime ?? '08:45');
  const [subject, setSubject] = useState(entry?.subject ?? '');
  const [room, setRoom] = useState(entry?.room ?? '');
  const [teacher, setTeacher] = useState(entry?.teacher ?? '');
  const [week, setWeek] = useState<WeekChoice>(entry?.week ?? 'all');
  const [error, setError] = useState<string | null>(null);
  // 2026-10-26 is a Monday.
  const weekdayLabel = (iso: number) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2026, 9, 25 + iso));

  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: ['school'] });
    router.back();
  };

  const save = useMutation({
    mutationFn: () => {
      if (!subject.trim()) throw new FormError(t('m.school.subjectRequired'));
      const startTime = oneTime(start);
      const endTime = oneTime(end);
      if (!startTime || !endTime) throw new FormError(t('m.common.invalidTime'));
      if (endTime <= startTime) throw new FormError(t('m.school.endBeforeStart'));
      const p = Number(period);
      if (!Number.isInteger(p) || p < 0 || p > 20) throw new FormError(t('m.school.invalidPeriod'));
      const body = {
        weekday: Number(weekday),
        period: p,
        startTime,
        endTime,
        subject: subject.trim(),
        room: room.trim() || null,
        teacher: teacher.trim() || null,
        week: week === 'all' ? null : week,
      };
      return entry
        ? api.school.timetable.update({ params: { householdId, entryId: entry.id }, body })
        : api.school.timetable.create({ params: { householdId }, body: { ...body, memberId } });
    },
    onSuccess: done,
    onError: (e) => {
      setError(errorMessage(e, t));
    },
  });

  const remove = useMutation({
    mutationFn: () =>
      api.school.timetable.remove({ params: { householdId, entryId: entry?.id ?? '' } }),
    onSuccess: done,
    onError: (e) => {
      setError(errorMessage(e, t));
    },
  });

  return (
    <ScreenScroll>
      <Stack.Screen
        options={{ title: entry ? t('m.school.editLesson') : t('m.school.addLesson') }}
      />
      {member ? <Text variant="caption">{member.displayName}</Text> : null}
      <TextField
        label={t('m.school.subject')}
        value={subject}
        onChangeText={setSubject}
        autoFocus={!entry}
      />
      <ChipSelect
        label={t('m.school.weekday')}
        options={WEEKDAY_VALUES.map((v) => ({ value: v, label: weekdayLabel(Number(v)) }))}
        value={weekday}
        onChange={setWeekday}
      />
      <View className="flex-row gap-2">
        <TextField
          className="flex-1"
          label={t('m.school.period')}
          value={period}
          onChangeText={setPeriod}
          keyboardType="number-pad"
          maxLength={2}
        />
        <TextField
          className="flex-1"
          label={t('m.school.start')}
          value={start}
          onChangeText={setStart}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />
        <TextField
          className="flex-1"
          label={t('m.school.end')}
          value={end}
          onChangeText={setEnd}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />
      </View>
      <TextField label={t('m.school.room')} value={room} onChangeText={setRoom} />
      <TextField label={t('m.school.teacher')} value={teacher} onChangeText={setTeacher} />
      <ChipSelect<WeekChoice>
        label={t('m.school.abWeek')}
        value={week}
        onChange={setWeek}
        options={[
          { value: 'all', label: t('m.school.everyWeek') },
          { value: 'A', label: t('m.school.weekLabel', { week: 'A' }) },
          { value: 'B', label: t('m.school.weekLabel', { week: 'B' }) },
        ]}
      />
      {error ? (
        <Text className="text-danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button
        title={t('common.save')}
        loading={save.isPending}
        onPress={() => {
          setError(null);
          save.mutate();
        }}
      />
      {entry ? (
        <Button
          variant="ghost"
          title={t('common.delete')}
          loading={remove.isPending}
          onPress={() => {
            void confirmAsync(t('m.school.deleteLesson'), entry.subject, {
              confirmLabel: t('common.delete'),
              cancelLabel: t('common.cancel'),
              destructive: true,
            }).then((ok) => {
              if (ok) remove.mutate();
            });
          }}
        />
      ) : null}
    </ScreenScroll>
  );
}
