import { useMutation } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { FeatureGate } from '@/components/gates';
import {
  Button,
  Card,
  ChipSelect,
  DateField,
  ErrorState,
  IconButton,
  LoadingView,
  Segmented,
  Text,
} from '@/components/ui';
import { dayKey } from '@/features/calendar/dates';
import { useAccounts, useCategoryLabels, useMoney } from '@/features/finance/hooks';
import { BarChart, LineChart } from '@/features/finance-plus/charts';
import { shareTextFile } from '@/features/finance-plus/export-file';
import { useCategoryTrends, useNetWorth, useYearOverYear } from '@/features/finance-plus/hooks';
import { monthLabel, monthsBack, yearMonth } from '@/features/finance-plus/months';
import { useHousehold } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { api } from '@/lib/api';
import { showError } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';

type Tab = 'netWorth' | 'trends' | 'yoy' | 'export';

export default function ReportsScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('netWorth');
  return (
    <FeatureGate feature="advanced_reports">
      <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 p-4 pb-12">
        <Segmented
          label={t('m.financePlus.reports')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'netWorth', label: t('m.financePlus.netWorth') },
            { value: 'trends', label: t('m.financePlus.trends') },
            { value: 'yoy', label: t('m.financePlus.yoy') },
            { value: 'export', label: t('m.financePlus.export') },
          ]}
        />
        {tab === 'netWorth' ? <NetWorth /> : null}
        {tab === 'trends' ? <Trends /> : null}
        {tab === 'yoy' ? <YearOverYear /> : null}
        {tab === 'export' ? <CsvExport /> : null}
      </ScrollView>
    </FeatureGate>
  );
}

function NetWorth() {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const fmt = useMoney();
  const now = new Date();
  const report = useNetWorth(monthsBack(now, 11), yearMonth(now));
  if (report.isPending) return <LoadingView />;
  if (report.error && !report.data)
    return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  const points = report.data.points;
  const first = points[0];
  const last = points[points.length - 1];
  const summary =
    first && last
      ? t('m.financePlus.netWorthSummary', {
          from: fmt(first.netWorthMinor, report.data.currency),
          fromMonth: monthLabel(first.month, locale),
          to: fmt(last.netWorthMinor, report.data.currency),
          toMonth: monthLabel(last.month, locale),
        })
      : t('m.financePlus.noData');
  return (
    <Card>
      <Text variant="subheading">{t('m.financePlus.netWorth')}</Text>
      {last ? <Text variant="title">{fmt(last.netWorthMinor, report.data.currency)}</Text> : null}
      <LineChart
        labels={points.map((p) => monthLabel(p.month, locale))}
        values={points.map((p) => p.netWorthMinor)}
        color={colors.primary}
        summary={summary}
      />
      <Text variant="caption">{summary}</Text>
    </Card>
  );
}

function Trends() {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const fmt = useMoney();
  const labels = useCategoryLabels();
  const now = new Date();
  const report = useCategoryTrends(monthsBack(now, 5), yearMonth(now));
  if (report.isPending) return <LoadingView />;
  if (report.error && !report.data)
    return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  const { months, categories } = report.data;
  const totals = months.map((_, i) =>
    categories.reduce((sum, c) => sum + (c.expenseMinor[i] ?? 0), 0),
  );
  const top = [...categories]
    .sort((a, b) => b.totalExpenseMinor - a.totalExpenseMinor)
    .filter((c) => c.totalExpenseMinor > 0)
    .slice(0, 8);
  const summary = months
    .map((m, i) => `${monthLabel(m, locale)}: ${fmt(totals[i] ?? 0)}`)
    .join(', ');
  return (
    <>
      <Card>
        <Text variant="subheading">{t('m.financePlus.spendingPerMonth')}</Text>
        <BarChart
          labels={months.map((m) => monthLabel(m, locale))}
          series={[{ name: t('m.finance.expenses'), color: colors.danger }]}
          values={[totals]}
          summary={`${t('m.financePlus.spendingPerMonth')}: ${summary}`}
        />
      </Card>
      <Card>
        <Text variant="subheading">{t('m.financePlus.topCategories')}</Text>
        {top.length === 0 ? (
          <Text variant="caption">{t('m.financePlus.noData')}</Text>
        ) : (
          top.map((c) => (
            <View key={c.categoryId ?? 'none'} className="flex-row justify-between gap-2">
              <Text className="flex-1" numberOfLines={1}>
                {c.categoryId ? (labels.get(c.categoryId) ?? '?') : t('categories.uncategorized')}
              </Text>
              <Text variant="caption">
                {t('m.financePlus.average', { amount: fmt(c.averageExpenseMinor) })}
              </Text>
              <Text className="font-semibold">{fmt(c.totalExpenseMinor)}</Text>
            </View>
          ))
        )}
      </Card>
    </>
  );
}

function YearOverYear() {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const fmt = useMoney();
  const labels = useCategoryLabels();
  const [year, setYear] = useState(new Date().getFullYear());
  const report = useYearOverYear(year);
  const monthName = (m: number) =>
    new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(year, m - 1, 15));
  return (
    <>
      <View className="flex-row items-center justify-between">
        <IconButton
          label={t('m.financePlus.previousYear')}
          onPress={() => {
            setYear((y) => y - 1);
          }}
        >
          <ChevronLeft size={22} color={colors.text} />
        </IconButton>
        <Text variant="subheading">{t('m.financePlus.yearVs', { year, previous: year - 1 })}</Text>
        <IconButton
          label={t('m.financePlus.nextYear')}
          onPress={() => {
            setYear((y) => y + 1);
          }}
        >
          <ChevronRight size={22} color={colors.text} />
        </IconButton>
      </View>
      {report.isPending ? (
        <LoadingView />
      ) : report.error && !report.data ? (
        <ErrorState error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <>
          <Card>
            <Text variant="subheading">{t('m.finance.expenses')}</Text>
            <BarChart
              labels={report.data.months.map((m) => monthName(m.month))}
              series={[
                { name: String(year), color: colors.primary },
                { name: String(year - 1), color: colors.textMuted },
              ]}
              values={[
                report.data.months.map((m) => m.expenseMinor),
                report.data.months.map((m) => m.previousExpenseMinor),
              ]}
              summary={t('m.financePlus.yoySummary', {
                year,
                expense: fmt(report.data.totals.expenseMinor),
                previous: year - 1,
                previousExpense: fmt(report.data.totals.previousExpenseMinor),
              })}
            />
            <Text variant="caption">
              {t('m.financePlus.yoySummary', {
                year,
                expense: fmt(report.data.totals.expenseMinor),
                previous: year - 1,
                previousExpense: fmt(report.data.totals.previousExpenseMinor),
              })}
            </Text>
            <Text variant="caption">
              {t('m.financePlus.incomeTotals', {
                income: fmt(report.data.totals.incomeMinor),
                previousIncome: fmt(report.data.totals.previousIncomeMinor),
              })}
            </Text>
          </Card>
          <Card>
            <Text variant="subheading">{t('m.financePlus.byCategory')}</Text>
            {report.data.categories.slice(0, 10).map((c) => (
              <View key={c.categoryId ?? 'none'} className="flex-row justify-between gap-2">
                <Text className="flex-1" numberOfLines={1}>
                  {c.categoryId ? (labels.get(c.categoryId) ?? '?') : t('categories.uncategorized')}
                </Text>
                <Text className="font-semibold">{fmt(c.expenseMinor)}</Text>
                <Text
                  variant="caption"
                  className={c.change !== null && c.change > 0 ? 'text-danger' : 'text-success'}
                >
                  {c.change === null
                    ? '–'
                    : `${c.change > 0 ? '+' : ''}${String(Math.round(c.change * 100))} %`}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}
    </>
  );
}

function CsvExport() {
  const { t } = useTranslation();
  const colors = useColors();
  const { householdId } = useHousehold();
  const accounts = useAccounts();
  const now = new Date();
  const [from, setFrom] = useState<Date | null>(new Date(now.getFullYear(), 0, 1));
  const [to, setTo] = useState<Date | null>(now);
  const [accountId, setAccountId] = useState<string>('all');
  const run = useMutation({
    mutationFn: async () => {
      const res = await api.financePlus.exportTransactions({
        params: { householdId },
        query: {
          from: dayKey(from ?? now),
          to: dayKey(to ?? now),
          ...(accountId !== 'all' ? { accountId } : {}),
        },
      });
      await shareTextFile(res.fileName, res.content, 'text/csv');
    },
    onError: (e) => {
      showError(e, t);
    },
  });
  return (
    <Card>
      <Text variant="subheading">{t('m.financePlus.exportTitle')}</Text>
      <Text variant="caption">{t('m.financePlus.exportHint')}</Text>
      <DateField label={t('m.financePlus.from')} value={from} onChange={setFrom} />
      <DateField label={t('m.financePlus.to')} value={to} onChange={setTo} />
      <ChipSelect
        label={t('m.finance.account')}
        value={accountId}
        onChange={setAccountId}
        options={[
          { value: 'all', label: t('common.all') },
          ...(accounts.data ?? []).map((a) => ({ value: a.id, label: a.name })),
        ]}
      />
      <Button
        title={t('m.financePlus.exportCsv')}
        icon={<Download size={18} color={colors.primaryText} />}
        loading={run.isPending}
        onPress={() => {
          run.mutate();
        }}
      />
    </Card>
  );
}
