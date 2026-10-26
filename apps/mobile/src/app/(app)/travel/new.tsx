import type { Output } from '@fp/api-client';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ChipMultiSelect,
  DateField,
  ErrorState,
  LoadingView,
  ScreenScroll,
  TextField,
} from '@/components/ui';
import { dayKey, parseDayKey } from '@/features/calendar/dates';
import { useAmountFormat } from '@/features/finance/hooks';
import { MoneyField } from '@/features/finance-plus/money-field';
import { minorToMoneyText, parseMoneyText } from '@/features/finance-plus/money-text';
import { useHousehold, useMembers } from '@/features/household/household';
import { useTravelMutation, useTrip } from '@/features/travel/hooks';
import { api } from '@/lib/api';

type TripDetail = Output<'travel', 'get'>;

/** Plan a trip, or edit one with `?tripId=`. */
export default function TripFormScreen() {
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  return tripId ? <EditTrip tripId={tripId} /> : <TripForm trip={undefined} />;
}

function EditTrip({ tripId }: { tripId: string }) {
  const { t } = useTranslation();
  const trip = useTrip(tripId);
  if (trip.isPending) return <LoadingView />;
  if (!trip.data) return <ErrorState error={trip.error} onRetry={() => void trip.refetch()} />;
  return (
    <>
      <Stack.Screen options={{ title: t('m.travel.editTrip') }} />
      <TripForm trip={trip.data} />
    </>
  );
}

function TripForm({ trip }: { trip: TripDetail | undefined }) {
  const { t } = useTranslation();
  const members = useMembers();
  const { can } = useHousehold();
  const format = useAmountFormat();
  const [name, setName] = useState(trip?.name ?? '');
  const [destination, setDestination] = useState(trip?.destination ?? '');
  const [start, setStart] = useState<Date | null>(trip ? parseDayKey(trip.startDate) : null);
  const [end, setEnd] = useState<Date | null>(trip ? parseDayKey(trip.endDate) : null);
  const [memberIds, setMemberIds] = useState<string[]>(
    () => trip?.memberIds ?? members.map((m) => m.id),
  );
  const [budget, setBudget] = useState(
    trip?.budgetMinor != null
      ? minorToMoneyText(trip.budgetMinor, format.exponent, format.style)
      : '',
  );
  const [notes, setNotes] = useState(trip?.notes ?? '');
  const [errors, setErrors] = useState<{
    name?: string;
    start?: string;
    end?: string;
    budget?: string;
  }>({});

  const save = useTravelMutation(
    (
      householdId,
      body: Parameters<typeof api.travel.update>[0]['body'] & {
        name: string;
        startDate: string;
        endDate: string;
      },
    ) =>
      trip
        ? api.travel.update({ params: { householdId, tripId: trip.id }, body })
        : api.travel.create({ params: { householdId }, body }),
    (saved) => {
      if (trip) router.back();
      else router.replace({ pathname: '/travel/[tripId]', params: { tripId: saved.id } });
    },
  );

  const submit = () => {
    const next: typeof errors = {};
    const budgetMinor =
      budget.trim() === '' ? null : parseMoneyText(budget, format.exponent, format.style);
    if (name.trim() === '') next.name = t('m.travel.nameRequired');
    if (!start) next.start = t('m.travel.dateRequired');
    if (!end) next.end = t('m.travel.dateRequired');
    else if (start && dayKey(end) < dayKey(start)) next.end = t('m.travel.endBeforeStart');
    if (budget.trim() !== '' && budgetMinor === null) next.budget = t('m.finance.enterAmount');
    setErrors(next);
    if (Object.keys(next).length > 0 || !start || !end) return;
    save.mutate({
      name: name.trim(),
      destination: destination.trim() === '' ? null : destination.trim(),
      startDate: dayKey(start),
      endDate: dayKey(end),
      memberIds,
      budgetMinor,
      notes: notes.trim() === '' ? null : notes.trim(),
    });
  };

  return (
    <ScreenScroll>
      <TextField
        label={t('common.name')}
        value={name}
        onChangeText={setName}
        placeholder={t('m.travel.namePlaceholder')}
        error={errors.name}
        autoFocus={!trip}
      />
      <TextField
        label={t('m.travel.destination')}
        value={destination}
        onChangeText={setDestination}
        placeholder={t('common.optional')}
      />
      <DateField
        label={t('m.travel.start')}
        value={start}
        onChange={setStart}
        error={errors.start}
      />
      <DateField
        label={t('m.travel.end')}
        value={end}
        onChange={setEnd}
        error={errors.end}
        {...(start ? { minimumDate: start } : {})}
      />
      <ChipMultiSelect
        label={t('m.travel.travellers')}
        value={memberIds}
        onChange={setMemberIds}
        options={members.map((m) => ({ value: m.id, label: m.displayName, color: m.color }))}
      />
      {can('finance.read') ? (
        <MoneyField
          label={t('m.travel.budget')}
          value={budget}
          onChangeText={setBudget}
          error={errors.budget}
          hint={t('common.optional')}
        />
      ) : null}
      <TextField label={t('m.finance.notes')} value={notes} onChangeText={setNotes} multiline />
      <Button title={t('common.save')} loading={save.isPending} onPress={submit} />
    </ScreenScroll>
  );
}
