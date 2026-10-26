import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ChipSelect,
  DateField,
  LoadingView,
  RowGroup,
  ScreenScroll,
  Segmented,
  SwitchRow,
  Text,
  TextField,
} from '@/components/ui';
import { amountInputToMinor, minorToAmountInput } from '@/features/finance/amount-input';
import { useAmountFormat } from '@/features/finance/hooks';
import { useMembers } from '@/features/household/household';
import { toLocalDate, parseLocalDate } from '@/features/meals/utils';
import {
  type AllowanceRule,
  useAllowanceRules,
  useRewardMutations,
} from '@/features/rewards/hooks';
import { useIntlLocale } from '@/i18n';
import { confirmAsync } from '@/lib/dialogs';

type Interval = AllowanceRule['interval'];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Create or edit a pocket-money rule (weekly on a weekday, or monthly on a day of month). */
export default function AllowanceRuleScreen() {
  const { ruleId } = useLocalSearchParams<{ ruleId?: string }>();
  const rules = useAllowanceRules();
  if (ruleId && rules.isPending) return <LoadingView />;
  const rule = ruleId ? (rules.data?.find((r) => r.id === ruleId) ?? null) : null;
  return <RuleForm key={rule?.id ?? 'new'} rule={rule} />;
}

function RuleForm({ rule }: { rule: AllowanceRule | null }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const amountFormat = useAmountFormat();
  const kids = useMembers().filter((m) => m.role === 'child' || m.role === 'teen');
  const { createAllowanceRule, updateAllowanceRule, removeAllowanceRule } = useRewardMutations();
  const [memberId, setMemberId] = useState<string | null>(rule?.memberId ?? kids[0]?.id ?? null);
  const [amount, setAmount] = useState(
    rule ? minorToAmountInput(rule.amountMinor, amountFormat) : '',
  );
  const [interval, setInterval] = useState<Interval>(rule?.interval ?? 'weekly');
  const [weekday, setWeekday] = useState<string>(String(rule?.weekday ?? 6));
  const [dayOfMonth, setDayOfMonth] = useState(String(rule?.dayOfMonth ?? 1));
  const [startsOn, setStartsOn] = useState<Date | null>(
    rule ? parseLocalDate(rule.startsOn) : new Date(),
  );
  const [active, setActive] = useState(rule?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  // 2024-01-01 was a Monday: ISO weekday n is Jan n.
  const weekdayLabel = (n: number) => weekdayFmt.format(new Date(2024, 0, n));

  const save = () => {
    if (!memberId) {
      setError(t('m.rewards.chooseMember'));
      return;
    }
    const minor = amountInputToMinor(amount, 'income', amountFormat);
    if (minor === null) {
      setError(t('m.rewards.invalidAmount'));
      return;
    }
    const dom = Number(dayOfMonth);
    if (interval === 'monthly' && (!Number.isInteger(dom) || dom < 1 || dom > 31)) {
      setError(t('m.rewards.invalidDayOfMonth'));
      return;
    }
    setError(null);
    const schedule = {
      amountMinor: minor,
      interval,
      weekday: interval === 'weekly' ? Number(weekday) : null,
      dayOfMonth: interval === 'monthly' ? dom : null,
      active,
      ...(startsOn ? { startsOn: toLocalDate(startsOn) } : {}),
    };
    const done = {
      onSuccess: () => {
        router.back();
      },
    };
    if (rule) updateAllowanceRule.mutate({ rule, body: schedule }, done);
    else createAllowanceRule.mutate({ memberId, ...schedule }, done);
  };

  const remove = async () => {
    if (!rule) return;
    const ok = await confirmAsync(t('m.rewards.deleteRule'), undefined, {
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok)
      removeAllowanceRule.mutate(rule, {
        onSuccess: () => {
          router.back();
        },
      });
  };

  return (
    <ScreenScroll>
      <Stack.Screen options={{ title: rule ? t('m.rewards.editRule') : t('m.rewards.newRule') }} />
      {kids.length === 0 ? <Text variant="caption">{t('m.rewards.noKids')}</Text> : null}
      <ChipSelect
        label={t('m.rewards.member')}
        value={memberId}
        onChange={(v) => {
          if (!rule) setMemberId(v);
        }}
        options={kids.map((k) => ({ value: k.id, label: k.displayName, color: k.color }))}
      />
      <TextField
        label={t('m.rewards.amount')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder={amountFormat.style === 'de' ? '5,00' : '5.00'}
        maxLength={12}
      />
      <Segmented<Interval>
        label={t('m.rewards.interval')}
        value={interval}
        onChange={setInterval}
        options={[
          { value: 'weekly', label: t('m.rewards.weekly') },
          { value: 'monthly', label: t('m.rewards.monthly') },
        ]}
      />
      {interval === 'weekly' ? (
        <ChipSelect
          label={t('m.rewards.weekday')}
          value={weekday}
          onChange={setWeekday}
          options={WEEKDAYS.map((n) => ({ value: String(n), label: weekdayLabel(n) }))}
        />
      ) : (
        <TextField
          label={t('m.rewards.dayOfMonth')}
          value={dayOfMonth}
          onChangeText={setDayOfMonth}
          keyboardType="number-pad"
          maxLength={2}
        />
      )}
      <DateField label={t('m.rewards.startsOn')} value={startsOn} onChange={setStartsOn} />
      <RowGroup>
        <SwitchRow title={t('m.rewards.active')} value={active} onValueChange={setActive} />
      </RowGroup>
      {error ? (
        <Text className="text-danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button
        title={t('common.save')}
        disabled={amount.trim() === '' || !memberId}
        loading={createAllowanceRule.isPending || updateAllowanceRule.isPending}
        onPress={save}
      />
      {rule ? (
        <Button
          variant="ghost"
          title={t('common.delete')}
          loading={removeAllowanceRule.isPending}
          onPress={() => void remove()}
        />
      ) : null}
    </ScreenScroll>
  );
}
