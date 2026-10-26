import type { Contact, EmergencyCard } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ChipMultiSelect,
  ChipSelect,
  ErrorState,
  LoadingView,
  ScreenScroll,
  Text,
  TextField,
} from '@/components/ui';
import { BLOOD_TYPES, useContacts, useEmergencyCard } from '@/features/contacts/hooks';
import { useHousehold, useMemberMap } from '@/features/household/household';
import { api } from '@/lib/api';
import { confirmAsync } from '@/lib/dialogs';
import { errorMessage } from '@/lib/errors';
import { splitList } from '@/features/contacts/text';

export default function EmergencyEditScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const card = useEmergencyCard(memberId);
  const contacts = useContacts();
  if (card.isPending || contacts.isPending) return <LoadingView />;
  if (card.error) return <ErrorState error={card.error} onRetry={() => void card.refetch()} />;
  return <EmergencyForm memberId={memberId} card={card.data} contacts={contacts.data ?? []} />;
}

type BloodType = (typeof BLOOD_TYPES)[number];

function EmergencyForm({
  memberId,
  card,
  contacts,
}: {
  memberId: string;
  card: EmergencyCard | null;
  contacts: Contact[];
}) {
  const { t } = useTranslation();
  const { householdId } = useHousehold();
  const member = useMemberMap().get(memberId);
  const queryClient = useQueryClient();
  const [bloodType, setBloodType] = useState<BloodType>(card?.bloodType ?? 'unknown');
  const [allergies, setAllergies] = useState(card?.allergies.join(', ') ?? '');
  const [conditions, setConditions] = useState(card?.conditions.join(', ') ?? '');
  const [medications, setMedications] = useState(card?.medications ?? '');
  const [provider, setProvider] = useState(card?.insuranceProvider ?? '');
  const [insuranceNumber, setInsuranceNumber] = useState(card?.insuranceNumber ?? '');
  const [doctorId, setDoctorId] = useState<string>(card?.doctorContactId ?? 'none');
  const [emergencyIds, setEmergencyIds] = useState<string[]>(card?.emergencyContactIds ?? []);
  const [notes, setNotes] = useState(card?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    router.back();
  };

  const save = useMutation({
    mutationFn: () => {
      const number = insuranceNumber.trim();
      return api.contacts.emergency.upsert({
        params: { householdId, memberId },
        body: {
          bloodType,
          allergies: splitList(allergies),
          conditions: splitList(conditions),
          medications: medications.trim() || null,
          insuranceProvider: provider.trim() || null,
          // Hidden numbers (only last 4 digits visible) stay unchanged unless a new one is typed.
          ...(number !== ''
            ? { insuranceNumber: number }
            : card?.insuranceNumber
              ? { insuranceNumber: null }
              : {}),
          doctorContactId: doctorId === 'none' ? null : doctorId,
          emergencyContactIds: emergencyIds,
          notes: notes.trim() || null,
        },
      });
    },
    onSuccess: done,
    onError: (e) => {
      setError(errorMessage(e, t));
    },
  });

  const remove = useMutation({
    mutationFn: () => api.contacts.emergency.remove({ params: { householdId, memberId } }),
    onSuccess: done,
    onError: (e) => {
      setError(errorMessage(e, t));
    },
  });

  const doctors = contacts.filter((c) => c.category === 'doctor' || c.id === card?.doctorContactId);

  return (
    <ScreenScroll>
      <Stack.Screen
        options={{ title: t('m.contacts.emergencyCardFor', { name: member?.displayName ?? '' }) }}
      />
      <ChipSelect
        label={t('m.contacts.bloodType')}
        options={BLOOD_TYPES.map((b) => ({
          value: b,
          label: b === 'unknown' ? t('m.contacts.unknown') : b,
        }))}
        value={bloodType}
        onChange={setBloodType}
      />
      <TextField
        label={t('m.contacts.allergies')}
        hint={t('m.contacts.commaHint')}
        value={allergies}
        onChangeText={setAllergies}
        placeholder={t('m.contacts.allergiesPlaceholder')}
      />
      <TextField
        label={t('m.contacts.conditions')}
        hint={t('m.contacts.commaHint')}
        value={conditions}
        onChangeText={setConditions}
      />
      <TextField
        label={t('m.contacts.medications')}
        value={medications}
        onChangeText={setMedications}
        multiline
      />
      <TextField label={t('m.contacts.insurance')} value={provider} onChangeText={setProvider} />
      <TextField
        label={t('m.contacts.insuranceNumber')}
        value={insuranceNumber}
        onChangeText={setInsuranceNumber}
        autoCapitalize="characters"
        placeholder={
          card?.insuranceNumberLast4 && !card.insuranceNumber
            ? `•••• ${card.insuranceNumberLast4}`
            : undefined
        }
      />
      {doctors.length > 0 ? (
        <ChipSelect
          label={t('m.contacts.doctor')}
          options={[
            { value: 'none', label: t('common.none') },
            ...doctors.map((c) => ({ value: c.id, label: c.name })),
          ]}
          value={doctorId}
          onChange={setDoctorId}
        />
      ) : (
        <Text variant="caption">{t('m.contacts.noDoctorsHint')}</Text>
      )}
      {contacts.length > 0 ? (
        <ChipMultiSelect
          label={t('m.contacts.emergencyContacts')}
          options={contacts.map((c) => ({ value: c.id, label: c.name }))}
          value={emergencyIds}
          onChange={(v) => {
            setEmergencyIds(v.slice(0, 10));
          }}
        />
      ) : null}
      <TextField label={t('m.contacts.notes')} value={notes} onChangeText={setNotes} multiline />
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
      {card ? (
        <Button
          variant="ghost"
          title={t('m.contacts.deleteEmergencyCard')}
          loading={remove.isPending}
          onPress={() => {
            void confirmAsync(t('m.contacts.deleteEmergencyCard'), undefined, {
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
