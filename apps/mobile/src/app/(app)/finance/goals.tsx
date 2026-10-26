import { router } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import {
  EmptyState,
  ErrorState,
  Fab,
  LoadingView,
  ProgressBar,
  RowGroup,
  SwitchRow,
  Text,
} from '@/components/ui';
import { useMoney } from '@/features/finance/hooks';
import { useGoals } from '@/features/finance-plus/hooks';
import { useHousehold } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { useColors } from '@/lib/theme';

/** Savings goals with progress; tap a goal for contributions. */
export default function GoalsScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const fmt = useMoney();
  const { can } = useHousehold();
  const [showArchived, setShowArchived] = useState(false);
  const goals = useGoals(showArchived);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-3 p-4 pb-28"
        refreshControl={
          <RefreshControl refreshing={goals.isRefetching} onRefresh={() => void goals.refetch()} />
        }
      >
        <RowGroup>
          <SwitchRow
            title={t('m.financePlus.showArchived')}
            value={showArchived}
            onValueChange={setShowArchived}
          />
        </RowGroup>
        {goals.isPending ? (
          <LoadingView />
        ) : goals.error && !goals.data ? (
          <ErrorState error={goals.error} onRetry={() => void goals.refetch()} />
        ) : goals.data.length === 0 ? (
          <EmptyState title={t('m.financePlus.noGoals')} message={t('m.financePlus.noGoalsHint')} />
        ) : (
          goals.data.map((g) => {
            const currency = g.currency;
            const saved = fmt(g.savedMinor, currency);
            const target = fmt(g.targetMinor, currency);
            return (
              <Pressable
                key={g.id}
                accessibilityRole="button"
                accessibilityLabel={`${g.name}, ${t('m.financePlus.savedOf', { saved, target })}`}
                onPress={() => {
                  router.push({ pathname: '/finance/goal', params: { goalId: g.id } });
                }}
                className="gap-2 rounded-lg border border-border bg-surface p-4 active:opacity-80"
              >
                <View className="flex-row items-center gap-2">
                  {g.color ? (
                    <View className="h-3 w-3 rounded-full" style={{ backgroundColor: g.color }} />
                  ) : null}
                  <Text variant="subheading" className="flex-1">
                    {g.name}
                  </Text>
                  {g.archived ? <Text variant="caption">{t('m.financePlus.archived')}</Text> : null}
                  {g.reached ? <Trophy size={20} color={colors.success} /> : null}
                </View>
                <ProgressBar
                  ratio={g.ratio}
                  tone={g.reached ? 'success' : 'primary'}
                  label={g.name}
                />
                <Text variant="caption">{t('m.financePlus.savedOf', { saved, target })}</Text>
                {g.deadline ? (
                  <Text variant="caption">
                    {t('m.financePlus.until', {
                      date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                        new Date(`${g.deadline}T12:00:00`),
                      ),
                    })}
                    {g.requiredMonthlyMinor !== null && !g.reached
                      ? ` · ${t('m.financePlus.perMonth', { amount: fmt(g.requiredMonthlyMinor, currency) })}`
                      : ''}
                  </Text>
                ) : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
      {can('finance.write') ? (
        <Fab
          label={t('m.financePlus.newGoal')}
          onPress={() => {
            router.push('/finance/goal-new');
          }}
        />
      ) : null}
    </View>
  );
}
