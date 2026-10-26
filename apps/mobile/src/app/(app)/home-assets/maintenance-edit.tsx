import type { MaintenancePlan } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import {
  Button,
  ChipSelect,
  DateField,
  Divider,
  EmptyState,
  ListRow,
  LoadingView,
  RowGroup,
  ScreenScroll,
  SectionHeader,
  Text,
  TextField,
} from '@/components/ui';
import { dayKey, parseDayKey } from '@/features/calendar/dates';
import { useMoney } from '@/features/finance/hooks';
import { useMaintenance, useMaintenanceLogs } from '@/features/home-assets/hooks';
import { useHousehold, useMemberMap, useMembers } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { api } from '@/lib/api';
import { confirmAsync } from '@/lib/dialogs';
import { errorMessage, FormError } from '@/lib/errors';

export default function EditMaintenanceScreen() {
  const { planId, assetId } = useLocalSearchParams<{ planId: string; assetId: string }>();
  const plans = useMaintenance({ assetId });
  if (plans.isPending) return <LoadingView />;
  const plan = plans.data?.find((p) => p.id === planId);
  if (!plan) return <EmptyState />;
  return <PlanForm key={plan.id} plan={plan} />;
}

function PlanForm({ plan }: { plan: MaintenancePlan }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const money = useMoney();
  const { householdId } = useHousehold();
  const members = useMembers();
  const memberMap = useMemberMap();
  const queryClient = useQueryClient();
  const { logs, isPending: logsPending } = useMaintenanceLogs([plan]);
  const [title, setTitle] = useState(plan.title);
  const [months, setMonths] = useState(
    plan.recurrence.mode === 'interval' ? String(plan.recurrence.months) : '',
  );
  const [nextDue, setNextDue] = useState<Date | null>(
    plan.nextDueOn ? parseDayKey(plan.nextDueOn) : null,
  );
  const [leadDays, setLeadDays] = useState(String(plan.leadDays));
  const [assignee, setAssignee] = useState<string>(plan.assigneeMemberId ?? 'none');
  const [notes, setNotes] = useState(plan.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const fmtDay = (k: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(`${k}T12:00:00`));

  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: ['home'] });
    router.back();
  };

  const save = useMutation({
    mutationFn: () => {
      if (!title.trim()) throw new FormError(t('m.homeAssets.titleRequired'));
      const lead = Number(leadDays);
      if (!Number.isInteger(lead) || lead < 0 || lead > 365)
        throw new FormError(t('m.homeAssets.invalidLeadDays'));
      let recurrence: { mode: 'interval'; months: number } | undefined;
      if (plan.recurrence.mode === 'interval') {
        const m = Number(months);
        if (!Number.isInteger(m) || m < 1 || m > 240)
          throw new FormError(t('m.homeAssets.invalidMonths'));
        recurrence = { mode: 'interval', months: m };
      }
      return api.home.maintenance.update({
        params: { householdId, planId: plan.id },
        body: {
          title: title.trim(),
          ...(recurrence ? { recurrence } : {}),
          nextDueOn: nextDue ? dayKey(nextDue) : null,
          leadDays: lead,
          assigneeMemberId: assignee === 'none' ? null : assignee,
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
    mutationFn: () => api.home.maintenance.remove({ params: { householdId, planId: plan.id } }),
    onSuccess: done,
    onError: (e) => {
      setError(errorMessage(e, t));
    },
  });

  return (
    <ScreenScroll>
      <TextField label={t('m.homeAssets.planTitle')} value={title} onChangeText={setTitle} />
      {plan.recurrence.mode === 'interval' ? (
        <TextField
          label={t('m.homeAssets.intervalMonths')}
          value={months}
          onChangeText={setMonths}
          keyboardType="number-pad"
          maxLength={3}
        />
      ) : (
        <Text variant="caption">{t('m.homeAssets.customRecurrence')}</Text>
      )}
      <DateField
        label={t('m.homeAssets.nextDue')}
        value={nextDue}
        onChange={setNextDue}
        clearable
      />
      <TextField
        label={t('m.homeAssets.leadDays')}
        hint={t('m.homeAssets.leadDaysHint')}
        value={leadDays}
        onChangeText={setLeadDays}
        keyboardType="number-pad"
        maxLength={3}
      />
      <ChipSelect
        label={t('m.homeAssets.assignee')}
        options={[
          { value: 'none', label: t('common.none') },
          ...members.map((m) => ({ value: m.id, label: m.displayName, color: m.color })),
        ]}
        value={assignee}
        onChange={setAssignee}
      />
      <TextField label={t('m.homeAssets.notes')} value={notes} onChangeText={setNotes} multiline />
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
      <Button
        variant="ghost"
        title={t('m.homeAssets.deletePlan')}
        loading={remove.isPending}
        onPress={() => {
          void confirmAsync(t('m.homeAssets.deletePlan'), plan.title, {
            confirmLabel: t('common.delete'),
            cancelLabel: t('common.cancel'),
            destructive: true,
          }).then((ok) => {
            if (ok) remove.mutate();
          });
        }}
      />

      <SectionHeader title={t('m.homeAssets.history')} />
      {logsPending ? (
        <LoadingView />
      ) : logs.length === 0 ? (
        <Text variant="caption">{t('m.homeAssets.noHistory')}</Text>
      ) : (
        <RowGroup>
          {logs.map((log, i) => (
            <View key={log.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={t('m.homeAssets.doneOnDate', { date: fmtDay(log.doneOn) })}
                subtitle={[
                  log.costMinor !== null ? money(log.costMinor) : null,
                  log.memberId ? memberMap.get(log.memberId)?.displayName : null,
                  log.notes,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            </View>
          ))}
        </RowGroup>
      )}
    </ScreenScroll>
  );
}
