import type { Medication } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import {
  Button,
  ChipMultiSelect,
  DateField,
  LoadingView,
  RowGroup,
  ScreenScroll,
  SwitchRow,
  Text,
  TextField,
} from '@/components/ui';
import { dayKey, parseDayKey } from '@/features/calendar/dates';
import { useMedications } from '@/features/health/hooks';
import {
  daysFromRrule,
  parseTimes,
  rruleFromDays,
  type Weekday,
  WEEKDAYS,
} from '@/features/health/schedule';
import { useHousehold, useMemberMap } from '@/features/household/household';
import { api } from '@/lib/api';
import { confirmAsync } from '@/lib/dialogs';
import { errorMessage, FormError } from '@/lib/errors';

export default function MedicationScreen() {
  const { memberId, medicationId } = useLocalSearchParams<{
    memberId: string;
    medicationId?: string;
  }>();
  const list = useMedications(memberId);
  if (medicationId && list.isPending) return <LoadingView />;
  const existing = medicationId ? list.data?.find((m) => m.id === medicationId) : undefined;
  return <MedicationForm key={existing?.id ?? 'new'} memberId={memberId} medication={existing} />;
}

function MedicationForm({
  memberId,
  medication,
}: {
  memberId: string;
  medication: Medication | undefined;
}) {
  const { t } = useTranslation();
  const { householdId, household } = useHousehold();
  const member = useMemberMap().get(memberId);
  const queryClient = useQueryClient();
  const [name, setName] = useState(medication?.name ?? '');
  const [dose, setDose] = useState(medication?.dose ?? '');
  const [times, setTimes] = useState(medication?.times.join(', ') ?? '08:00');
  const initialDays = medication ? daysFromRrule(medication.rrule) : [...WEEKDAYS];
  const [days, setDays] = useState<Weekday[]>(initialDays ?? []);
  const customRule = medication !== undefined && initialDays === null;
  const [startOn, setStartOn] = useState<Date | null>(
    medication ? parseDayKey(medication.startOn) : new Date(),
  );
  const [endOn, setEndOn] = useState<Date | null>(
    medication?.endOn ? parseDayKey(medication.endOn) : null,
  );
  const [reminders, setReminders] = useState(medication?.reminders ?? true);
  const [notes, setNotes] = useState(medication?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: ['health'] });
    router.back();
  };

  const save = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new FormError(t('m.health.nameRequired'));
      const parsedTimes = parseTimes(times);
      if (!parsedTimes) throw new FormError(t('m.health.invalidTimes'));
      if (!startOn) throw new FormError(t('m.health.startRequired'));
      if (endOn && endOn < startOn) throw new FormError(t('m.health.endBeforeStart'));
      const common = {
        name: name.trim(),
        dose: dose.trim() || null,
        times: parsedTimes,
        ...(customRule ? {} : { rrule: rruleFromDays(days) }),
        startOn: dayKey(startOn),
        endOn: endOn ? dayKey(endOn) : null,
        reminders,
        notes: notes.trim() || null,
      };
      return medication
        ? api.health.medications.update({
            params: { householdId, medicationId: medication.id },
            body: common,
          })
        : api.health.medications.create({
            params: { householdId },
            body: { ...common, memberId, timezone: household.timezone },
          });
    },
    onSuccess: done,
    onError: (e) => {
      setError(errorMessage(e, t));
    },
  });

  const remove = useMutation({
    mutationFn: () =>
      api.health.medications.remove({
        params: { householdId, medicationId: medication?.id ?? '' },
      }),
    onSuccess: done,
    onError: (e) => {
      setError(errorMessage(e, t));
    },
  });

  return (
    <ScreenScroll>
      <Stack.Screen
        options={{
          title: medication ? t('m.health.editMedication') : t('m.health.addMedication'),
        }}
      />
      {member ? <Text variant="caption">{member.displayName}</Text> : null}
      <TextField
        label={t('m.health.medicationName')}
        value={name}
        onChangeText={setName}
        autoFocus={!medication}
      />
      <TextField
        label={t('m.health.dose')}
        value={dose}
        onChangeText={setDose}
        placeholder={t('m.health.dosePlaceholder')}
      />
      <TextField
        label={t('m.health.times')}
        hint={t('m.health.timesHint')}
        value={times}
        onChangeText={setTimes}
        keyboardType="numbers-and-punctuation"
      />
      {customRule ? (
        <Text variant="caption">{t('m.health.customRule')}</Text>
      ) : (
        <ChipMultiSelect
          label={t('m.health.days')}
          options={WEEKDAYS.map((d) => ({ value: d, label: t(`m.health.weekdays.${d}`) }))}
          value={days}
          onChange={setDays}
        />
      )}
      <DateField label={t('m.health.startOn')} value={startOn} onChange={setStartOn} />
      <DateField label={t('m.health.endOn')} value={endOn} onChange={setEndOn} clearable />
      <RowGroup>
        <SwitchRow
          title={t('m.health.reminders')}
          subtitle={t('m.health.remindersHint')}
          value={reminders}
          onValueChange={setReminders}
        />
      </RowGroup>
      <TextField label={t('m.health.notes')} value={notes} onChangeText={setNotes} multiline />
      {error ? (
        <Text className="text-danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View className="gap-2">
        <Button
          title={t('common.save')}
          loading={save.isPending}
          onPress={() => {
            setError(null);
            save.mutate();
          }}
        />
        {medication ? (
          <Button
            variant="ghost"
            title={t('common.delete')}
            loading={remove.isPending}
            onPress={() => {
              void confirmAsync(t('m.health.deleteMedication'), medication.name, {
                confirmLabel: t('common.delete'),
                cancelLabel: t('common.cancel'),
                destructive: true,
              }).then((ok) => {
                if (ok) remove.mutate();
              });
            }}
          />
        ) : null}
      </View>
    </ScreenScroll>
  );
}
