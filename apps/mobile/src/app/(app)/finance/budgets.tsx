import { parseAmountToMinor } from '@fp/domain/money';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import {
  Button,
  Card,
  ChipSelect,
  EmptyState,
  ErrorState,
  LoadingView,
  SectionHeader,
  Segmented,
  Text,
  TextField,
} from '@/components/ui';
import { BudgetLine } from '@/features/finance/budget-card';
import {
  useAmountFormat,
  useBudgets,
  useCategories,
  useCategoryLabels,
} from '@/features/finance/hooks';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { errorMessage, FormError } from '@/lib/errors';

export default function BudgetsScreen() {
  const { t } = useTranslation();
  const { householdId, can } = useHousehold();
  const queryClient = useQueryClient();
  const budgets = useBudgets();
  const categories = useCategories();
  const labels = useCategoryLabels();
  const format = useAmountFormat();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [limit, setLimit] = useState('');
  const [error, setError] = useState<string | null>(null);

  const budgeted = new Set((budgets.data ?? []).map((b) => b.budget.categoryId));
  const categoryOptions = (categories.data ?? [])
    .filter((c) => c.kind === 'expense' && !c.hidden && !budgeted.has(c.id))
    .map((c) => ({ value: c.id, label: labels.get(c.id) ?? c.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const create = useMutation({
    mutationFn: () => {
      if (!categoryId) throw new FormError(t('m.finance.chooseCategory'));
      let limitMinor: number;
      try {
        limitMinor = Math.abs(parseAmountToMinor(limit, format.exponent, format.style));
      } catch {
        throw new FormError(t('m.finance.enterAmount'));
      }
      if (limitMinor === 0) throw new FormError(t('m.finance.enterAmount'));
      return api.finance.createBudget({
        params: { householdId },
        body: { categoryId, period, limitMinor },
      });
    },
    onSuccess: async () => {
      setCategoryId(null);
      setLimit('');
      await queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (e) => {
      setError(errorMessage(e, t));
    },
  });

  const remove = useMutation({
    mutationFn: (budgetId: string) =>
      api.finance.deleteBudget({ params: { householdId, budgetId } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['finance'] }),
  });

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={budgets.isRefetching}
          onRefresh={() => void budgets.refetch()}
        />
      }
    >
      {budgets.isPending ? (
        <LoadingView />
      ) : budgets.error && !budgets.data ? (
        <ErrorState error={budgets.error} onRetry={() => void budgets.refetch()} />
      ) : budgets.data.length === 0 ? (
        <EmptyState title={t('m.finance.noBudgets')} />
      ) : (
        <Card className="gap-5">
          {budgets.data.map((b) => (
            <Pressable
              key={b.budget.id}
              accessibilityHint={can('finance.write') ? t('m.finance.longPressDelete') : undefined}
              onLongPress={() => {
                if (!can('finance.write')) return;
                Alert.alert(t('m.finance.deleteBudget'), labels.get(b.budget.categoryId) ?? '', [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: () => {
                      remove.mutate(b.budget.id);
                    },
                  },
                ]);
              }}
            >
              <BudgetLine status={b} />
              <Text variant="caption">{t(`m.finance.periods.${b.budget.period}`)}</Text>
            </Pressable>
          ))}
        </Card>
      )}

      {can('finance.write') ? (
        <>
          <SectionHeader title={t('m.finance.newBudget')} />
          <ChipSelect
            label={t('m.finance.category')}
            options={categoryOptions}
            value={categoryId}
            onChange={setCategoryId}
          />
          <Segmented
            label={t('m.finance.period')}
            options={[
              { value: 'monthly', label: t('m.finance.periods.monthly') },
              { value: 'yearly', label: t('m.finance.periods.yearly') },
            ]}
            value={period}
            onChange={setPeriod}
          />
          <TextField
            label={t('m.finance.limit')}
            value={limit}
            onChangeText={setLimit}
            keyboardType="decimal-pad"
            placeholder={format.style === 'de' ? '250,00' : '250.00'}
          />
          {error ? <Text className="text-danger">{error}</Text> : null}
          <View>
            <Button
              title={t('common.create')}
              loading={create.isPending}
              onPress={() => {
                setError(null);
                create.mutate();
              }}
            />
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
