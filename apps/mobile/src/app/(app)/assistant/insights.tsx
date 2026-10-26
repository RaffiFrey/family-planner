import { useMutation } from '@tanstack/react-query';
import { Lightbulb } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { UpsellState } from '@/components/gates';
import { Button, Card, ProgressBar, ScreenScroll, Segmented, Text } from '@/components/ui';
import { AssistantGate } from '@/features/assistant/assistant-gate';
import { assistantErrorMessage } from '@/features/assistant/errors';
import { useMoney } from '@/features/finance/hooks';
import { useHousehold } from '@/features/household/household';
import { isCurrencyCode } from '@fp/domain/money';
import { api } from '@/lib/api';
import { isPlanLimit } from '@/lib/errors';
import { useColors } from '@/lib/theme';

export default function InsightsScreen() {
  return (
    <AssistantGate>
      <Insights />
    </AssistantGate>
  );
}

/** Spending summary of the last months (only aggregates are sent to the model). */
function Insights() {
  const { t } = useTranslation();
  const colors = useColors();
  const fmt = useMoney();
  const { householdId, household, can } = useHousehold();
  const [months, setMonths] = useState<'1' | '3' | '6' | '12'>('3');
  const run = useMutation({
    mutationFn: () =>
      api.assistant.insights({ params: { householdId }, body: { months: Number(months) } }),
  });
  const data = run.data;
  const currency = data && isCurrencyCode(data.currency) ? data.currency : household.currency;

  if (!can('finance.read')) return <Text className="p-4">{t('errors.forbidden')}</Text>;

  return (
    <ScreenScroll>
      <Text variant="caption">{t('m.assistant.insightsIntro')}</Text>
      <Segmented
        label={t('m.assistant.period')}
        value={months}
        onChange={setMonths}
        options={(['1', '3', '6', '12'] as const).map((m) => ({
          value: m,
          label: t('m.assistant.months', { count: Number(m) }),
        }))}
      />
      <Button
        title={t('m.assistant.analyze')}
        loading={run.isPending}
        onPress={() => {
          run.mutate();
        }}
      />
      {run.error ? (
        isPlanLimit(run.error) ? (
          <UpsellState feature="ai_assistant" compact />
        ) : (
          <Text className="text-danger" accessibilityLiveRegion="polite">
            {assistantErrorMessage(run.error, t)}
          </Text>
        )
      ) : null}
      {data ? (
        <>
          <Card>
            <Text accessibilityLiveRegion="polite">{data.text}</Text>
            <View className="flex-row gap-4">
              <View className="flex-1">
                <Text variant="caption">{t('m.finance.income')}</Text>
                <Text className="font-semibold text-success">
                  {fmt(data.totalIncomeMinor, currency)}
                </Text>
              </View>
              <View className="flex-1">
                <Text variant="caption">{t('m.finance.expenses')}</Text>
                <Text className="font-semibold text-danger">
                  {fmt(data.totalExpenseMinor, currency)}
                </Text>
              </View>
            </View>
            <Text variant="caption">
              {t('m.assistant.avgMonthly', { amount: fmt(data.avgMonthlyExpenseMinor, currency) })}
              {data.savingsRatePercent !== null
                ? ` · ${t('m.assistant.savingsRate', { percent: Math.round(data.savingsRatePercent) })}`
                : ''}
            </Text>
          </Card>
          {data.topCategories.length > 0 ? (
            <Card>
              <Text variant="subheading">{t('m.financePlus.topCategories')}</Text>
              {data.topCategories.map((c) => (
                <View key={c.name} className="gap-1">
                  <View className="flex-row justify-between">
                    <Text>{c.name}</Text>
                    <Text className="font-semibold">{fmt(c.expenseMinor, currency)}</Text>
                  </View>
                  <ProgressBar
                    ratio={c.percent / 100}
                    label={`${c.name} ${String(Math.round(c.percent))} %`}
                  />
                </View>
              ))}
            </Card>
          ) : null}
          {data.tips.length > 0 ? (
            <Card>
              <Text variant="subheading">{t('m.assistant.tips')}</Text>
              {data.tips.map((tip) => (
                <View key={tip} className="flex-row gap-2">
                  <Lightbulb size={18} color={colors.warning} />
                  <Text className="flex-1">{tip}</Text>
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
    </ScreenScroll>
  );
}
