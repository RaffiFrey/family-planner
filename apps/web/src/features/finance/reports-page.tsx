'use client';

import { apiQuery } from '@fp/api-client';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/use-format';
import { AdvancedReports } from '@/features/finance-plus/advanced-reports';
import { useCategoryLabel, useCategoryOptions } from './hooks';

const pad = (n: number) => String(n).padStart(2, '0');
const yearMonth = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const localDate = (d: Date) => `${yearMonth(d)}-${pad(d.getDate())}`;

type RangeKey = 'thisMonth' | 'lastMonth' | 'last3' | 'thisYear';
const RANGES: RangeKey[] = ['thisMonth', 'lastMonth', 'last3', 'thisYear'];

function rangeFor(key: RangeKey, now = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case 'thisMonth':
      return { from: localDate(new Date(y, m, 1)), to: localDate(new Date(y, m + 1, 0)) };
    case 'lastMonth':
      return { from: localDate(new Date(y, m - 1, 1)), to: localDate(new Date(y, m, 0)) };
    case 'last3':
      return { from: localDate(new Date(y, m - 2, 1)), to: localDate(new Date(y, m + 1, 0)) };
    case 'thisYear':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
}

export function ReportsPage() {
  const t = useTranslations('finance.reports');
  return (
    <div className="grid gap-6">
      <PageHeader title={t('title')} className="mb-0" />
      <CashflowCard />
      <CategoryCard />
      <AdvancedReports />
    </div>
  );
}

function CashflowCard() {
  const t = useTranslations('finance.reports');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const range = React.useMemo(() => {
    const now = new Date();
    return {
      from: yearMonth(new Date(now.getFullYear(), now.getMonth() - 11, 1)),
      to: yearMonth(now),
    };
  }, []);
  const query = useQuery(
    apiQuery(api, 'finance', 'cashflow', { params: { householdId }, query: range }),
  );

  const monthLabel = React.useCallback(
    (ym: string) => fmt.date(`${ym}-15T12:00:00Z`, { month: 'short', year: '2-digit' }),
    [fmt],
  );
  const data = React.useMemo(
    () =>
      (query.data ?? []).map((r) => ({
        month: r.month,
        label: monthLabel(r.month),
        income: Math.abs(r.incomeMinor),
        expense: Math.abs(r.expenseMinor),
        net: r.netMinor,
      })),
    [query.data, monthLabel],
  );
  const compact = React.useMemo(
    () => new Intl.NumberFormat(fmt.intlLocale, { notation: 'compact', maximumFractionDigits: 1 }),
    [fmt.intlLocale],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('cashflow')}</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <LoadingState rows={1} className="[&>div]:h-72" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : data.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <>
            <figure className="h-72 w-full" aria-label={t('chartLabel')}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-border)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    // Axis ticks are approximate by design; exact amounts are in tooltip and table.
                    tickFormatter={(v: number) => compact.format(Math.round(v / 100))}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--color-surface-muted)' }}
                    contentStyle={{
                      background: 'var(--color-background)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      color: 'var(--color-foreground)',
                    }}
                    formatter={(value) => fmt.money(Number(value))}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="income"
                    name={t('income')}
                    fill="var(--color-success)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="expense"
                    name={t('expense')}
                    fill="var(--color-danger)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </figure>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer rounded-sm text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary">
                {t('showTable')}
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t('cashflow')}</caption>
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th scope="col" className="py-1 pr-3 font-medium">
                        {t('month')}
                      </th>
                      <th scope="col" className="py-1 pr-3 text-right font-medium">
                        {t('income')}
                      </th>
                      <th scope="col" className="py-1 pr-3 text-right font-medium">
                        {t('expense')}
                      </th>
                      <th scope="col" className="py-1 text-right font-medium">
                        {t('net')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {data.map((r) => (
                      <tr key={r.month} className="border-t border-border">
                        <th scope="row" className="py-1 pr-3 text-left font-normal">
                          {r.label}
                        </th>
                        <td className="py-1 pr-3 text-right">{fmt.money(r.income)}</td>
                        <td className="py-1 pr-3 text-right">{fmt.money(r.expense)}</td>
                        <td
                          className={r.net < 0 ? 'py-1 text-right text-danger' : 'py-1 text-right'}
                        >
                          {fmt.money(r.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryCard() {
  const t = useTranslations('finance.reports');
  const { householdId } = useHousehold();
  const label = useCategoryLabel();
  const { byId } = useCategoryOptions({ includeHidden: true });
  const [rangeKey, setRangeKey] = React.useState<RangeKey>('thisMonth');
  const range = React.useMemo(() => rangeFor(rangeKey), [rangeKey]);
  const query = useQuery(
    apiQuery(api, 'finance', 'byCategory', { params: { householdId }, query: range }),
  );

  const build = (pick: 'expenseMinor' | 'incomeMinor') => {
    const rows = (query.data ?? [])
      .map((r) => ({
        id: r.categoryId ?? 'none',
        name: label(r.categoryId ? byId.get(r.categoryId) : null),
        color: (r.categoryId ? byId.get(r.categoryId)?.color : null) ?? null,
        amount: Math.abs(r[pick]),
        count: r.count,
      }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return { rows, total };
  };
  const expenses = build('expenseMinor');
  const income = build('incomeMinor');

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{t('byCategory')}</CardTitle>
        <div className="flex items-center gap-2">
          <Label htmlFor="report-range" className="text-sm text-muted">
            {t('range')}
          </Label>
          <NativeSelect
            id="report-range"
            className="w-auto"
            value={rangeKey}
            onChange={(e) => setRangeKey(e.target.value as RangeKey)}
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                {t(`ranges.${r}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6">
        {query.isPending ? (
          <LoadingState rows={4} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : expenses.rows.length === 0 && income.rows.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <>
            <Breakdown title={t('byCategory')} data={expenses} color="var(--color-danger)" />
            {income.rows.length > 0 ? (
              <Breakdown title={t('incomeByCategory')} data={income} color="var(--color-success)" />
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface BreakdownData {
  rows: { id: string; name: string; color: string | null; amount: number; count: number }[];
  total: number;
}

function Breakdown({ title, data, color }: { title: string; data: BreakdownData; color: string }) {
  const t = useTranslations('finance.reports');
  const fmt = useFormat();
  if (data.rows.length === 0) return null;
  return (
    <table className="w-full text-sm">
      <caption className="mb-2 text-left text-sm font-medium">
        {title}: {fmt.money(data.total)}
      </caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{title}</th>
          <th scope="col">{t('share')}</th>
          <th scope="col">{t('count')}</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((r) => {
          const share = data.total > 0 ? Math.round((r.amount / data.total) * 1000) / 10 : 0;
          return (
            <tr key={r.id}>
              <th scope="row" className="w-full py-1.5 pr-3 text-left font-normal">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate">{r.name}</span>
                  <span className="font-medium whitespace-nowrap tabular-nums">
                    {fmt.money(r.amount)}
                  </span>
                </div>
                <div
                  className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-muted"
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${share}%`, backgroundColor: r.color ?? color }}
                  />
                </div>
              </th>
              <td className="py-1.5 pr-2 text-right align-top whitespace-nowrap text-muted tabular-nums">
                {new Intl.NumberFormat(fmt.intlLocale, { maximumFractionDigits: 1 }).format(share)}{' '}
                %
              </td>
              <td
                className="py-1.5 text-right align-top whitespace-nowrap text-muted tabular-nums"
                title={t('count')}
              >
                {r.count}×
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
