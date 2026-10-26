import { router } from 'expo-router';
import {
  ChartLine,
  FileText,
  Goal,
  HandCoins,
  Landmark,
  PiggyBank,
  Receipt,
  RefreshCw,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import {
  Button,
  Card,
  Divider,
  ErrorState,
  Fab,
  ListRow,
  LoadingView,
  RowGroup,
  SectionHeader,
  Text,
} from '@/components/ui';
import { useAccounts, useMoney, useOverview } from '@/features/finance/hooks';
import { useHousehold } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { useColors } from '@/lib/theme';

export default function FinanceScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const { can } = useHousehold();
  const fmt = useMoney();
  const overview = useOverview();
  const accounts = useAccounts();
  const refresh = () => {
    void overview.refetch();
    void accounts.refetch();
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-28"
        refreshControl={
          <RefreshControl
            refreshing={overview.isRefetching || accounts.isRefetching}
            onRefresh={refresh}
          />
        }
      >
        {overview.data ? (
          <Card>
            <Text variant="caption">{t('m.finance.netWorth')}</Text>
            <Text variant="title" accessibilityRole="text">
              {fmt(overview.data.netWorthMinor, overview.data.currency)}
            </Text>
            <Text variant="caption">
              {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
                new Date(`${overview.data.month}-01T12:00:00`),
              )}
            </Text>
            <View className="flex-row gap-4">
              <View className="flex-1">
                <Text variant="caption">{t('m.finance.income')}</Text>
                <Text className="font-semibold text-success">
                  {fmt(overview.data.incomeMinor, overview.data.currency)}
                </Text>
              </View>
              <View className="flex-1">
                <Text variant="caption">{t('m.finance.expenses')}</Text>
                <Text className="font-semibold text-danger">
                  {fmt(overview.data.expenseMinor, overview.data.currency)}
                </Text>
              </View>
            </View>
            {overview.data.uncategorizedCount > 0 ? (
              <Text variant="caption">
                {t('m.finance.uncategorized', { count: overview.data.uncategorizedCount })}
              </Text>
            ) : null}
          </Card>
        ) : overview.error ? (
          <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
        ) : (
          <LoadingView />
        )}

        <RowGroup>
          <ListRow
            title={t('m.finance.transactions')}
            left={<Receipt size={22} color={colors.primary} />}
            chevron
            onPress={() => {
              router.push('/finance/transactions');
            }}
          />
          <Divider />
          <ListRow
            title={t('m.finance.budgets')}
            left={<PiggyBank size={22} color={colors.primary} />}
            chevron
            onPress={() => {
              router.push('/finance/budgets');
            }}
          />
          <Divider />
          <ListRow
            title={t('m.financePlus.shared')}
            subtitle={t('m.financePlus.sharedHint')}
            left={<HandCoins size={22} color={colors.primary} />}
            chevron
            onPress={() => {
              router.push('/finance/shared');
            }}
          />
          <Divider />
          <ListRow
            title={t('m.financePlus.goals')}
            subtitle={t('m.financePlus.goalsHint')}
            left={<Goal size={22} color={colors.primary} />}
            chevron
            onPress={() => {
              router.push('/finance/goals');
            }}
          />
          <Divider />
          <ListRow
            title={t('m.financePlus.contracts')}
            subtitle={t('m.financePlus.contractsHint')}
            left={<FileText size={22} color={colors.primary} />}
            chevron
            onPress={() => {
              router.push('/finance/contracts');
            }}
          />
          <Divider />
          <ListRow
            title={t('m.financePlus.reports')}
            subtitle={t('m.financePlus.reportsHint')}
            left={<ChartLine size={22} color={colors.primary} />}
            chevron
            onPress={() => {
              router.push('/finance/reports');
            }}
          />
          <Divider />
          <ListRow
            title={t('m.financePlus.bankSync')}
            subtitle={t('m.financePlus.bankSyncHint')}
            left={<RefreshCw size={22} color={colors.primary} />}
            chevron
            onPress={() => {
              router.push('/finance/bank-sync');
            }}
          />
        </RowGroup>

        <SectionHeader
          title={t('m.finance.accounts')}
          action={
            can('finance.write') ? (
              <Button
                size="sm"
                variant="ghost"
                title={t('common.add')}
                onPress={() => {
                  router.push('/finance/account-new');
                }}
              />
            ) : null
          }
        />
        {accounts.data ? (
          accounts.data.length === 0 ? (
            <Card>
              <Text variant="caption">{t('m.finance.noAccounts')}</Text>
            </Card>
          ) : (
            <RowGroup>
              {accounts.data.map((a, i) => (
                <View key={a.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={a.name}
                    subtitle={[
                      t(`accountTypes.${a.type}`),
                      a.institution,
                      a.ibanLast4 ? `•••• ${a.ibanLast4}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    left={<Landmark size={22} color={a.color ?? colors.textMuted} />}
                    right={
                      <Text
                        className={`font-semibold ${a.balanceMinor < 0 ? 'text-danger' : 'text-text'}`}
                      >
                        {fmt(a.balanceMinor, a.currency)}
                      </Text>
                    }
                    onPress={() => {
                      router.push({
                        pathname: '/finance/transactions',
                        params: { accountId: a.id, title: a.name },
                      });
                    }}
                  />
                </View>
              ))}
            </RowGroup>
          )
        ) : accounts.error ? (
          <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />
        ) : (
          <LoadingView />
        )}
      </ScrollView>
      {can('finance.write') ? (
        <Fab
          label={t('m.finance.newTransaction')}
          onPress={() => {
            router.push('/finance/transaction');
          }}
        />
      ) : null}
    </View>
  );
}
