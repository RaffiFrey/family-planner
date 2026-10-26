import type { Vaccination } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, DateField, LoadingView, ScreenScroll, Text, TextField } from '@/components/ui';
import { dayKey, parseDayKey } from '@/features/calendar/dates';
import { useVaccinations } from '@/features/health/hooks';
import { useHousehold, useMemberMap } from '@/features/household/household';
import { api } from '@/lib/api';
import { confirmAsync } from '@/lib/dialogs';
import { errorMessage, FormError } from '@/lib/errors';

export default function VaccinationScreen() {
  const { memberId, vaccinationId } = useLocalSearchParams<{
    memberId: string;
    vaccinationId?: string;
  }>();
  const list = useVaccinations(memberId);
  if (vaccinationId && list.isPending) return <LoadingView />;
  const existing = vaccinationId ? list.data?.find((v) => v.id === vaccinationId) : undefined;
  return <VaccinationForm key={existing?.id ?? 'new'} memberId={memberId} vaccination={existing} />;
}

function VaccinationForm({
  memberId,
  vaccination,
}: {
  memberId: string;
  vaccination: Vaccination | undefined;
}) {
  const { t } = useTranslation();
  const { householdId } = useHousehold();
  const member = useMemberMap().get(memberId);
  const queryClient = useQueryClient();
  const [vaccine, setVaccine] = useState(vaccination?.vaccine ?? '');
  const [dose, setDose] = useState(vaccination?.dose ?? '');
  const [givenOn, setGivenOn] = useState<Date | null>(
    vaccination ? parseDayKey(vaccination.givenOn) : new Date(),
  );
  const [nextDueOn, setNextDueOn] = useState<Date | null>(
    vaccination?.nextDueOn ? parseDayKey(vaccination.nextDueOn) : null,
  );
  const [batch, setBatch] = useState(vaccination?.batch ?? '');
  const [notes, setNotes] = useState(vaccination?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: ['health'] });
    router.back();
  };

  const save = useMutation({
    mutationFn: () => {
      if (!vaccine.trim()) throw new FormError(t('m.health.vaccineRequired'));
      if (!givenOn) throw new FormError(t('m.health.givenOnRequired'));
      const body = {
        vaccine: vaccine.trim(),
        givenOn: dayKey(givenOn),
        dose: dose.trim() || null,
        nextDueOn: nextDueOn ? dayKey(nextDueOn) : null,
        batch: batch.trim() || null,
        notes: notes.trim() || null,
      };
      return vaccination
        ? api.health.vaccinations.update({
            params: { householdId, vaccinationId: vaccination.id },
            body,
          })
        : api.health.vaccinations.create({ params: { householdId }, body: { ...body, memberId } });
    },
    onSuccess: done,
    onError: (e) => {
      setError(errorMessage(e, t));
    },
  });

  const remove = useMutation({
    mutationFn: () =>
      api.health.vaccinations.remove({
        params: { householdId, vaccinationId: vaccination?.id ?? '' },
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
          title: vaccination ? t('m.health.editVaccination') : t('m.health.addVaccination'),
        }}
      />
      {member ? <Text variant="caption">{member.displayName}</Text> : null}
      <TextField
        label={t('m.health.vaccine')}
        value={vaccine}
        onChangeText={setVaccine}
        placeholder={t('m.health.vaccinePlaceholder')}
        autoFocus={!vaccination}
      />
      <TextField
        label={t('m.health.dose')}
        value={dose}
        onChangeText={setDose}
        placeholder={t('m.health.vaccineDosePlaceholder')}
      />
      <DateField label={t('m.health.givenOnLabel')} value={givenOn} onChange={setGivenOn} />
      <DateField
        label={t('m.health.nextDueLabel')}
        value={nextDueOn}
        onChange={setNextDueOn}
        clearable
      />
      <TextField label={t('m.health.batch')} value={batch} onChangeText={setBatch} />
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
        {vaccination ? (
          <Button
            variant="ghost"
            title={t('common.delete')}
            loading={remove.isPending}
            onPress={() => {
              void confirmAsync(t('m.health.deleteVaccination'), vaccination.vaccine, {
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
