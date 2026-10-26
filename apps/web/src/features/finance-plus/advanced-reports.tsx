'use client';

import { apiQuery } from '@fp/api-client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { EmptyState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UpsellState } from '@/components/upsell';
import { useAccounts, useCategoryLabel, useCategoryOptions } from '@/features/finance/hooks';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useFeature } from '@/lib/entitlements';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { PlusQueryView, toLocalDate, toYearMonth } from './shared';

const SERIES_COLORS = ['#1d5ef1', '#db2777', '#16a34a', '#ea580c', '#7c3aed', '#0891b2'];

const tooltipStyle = {
  background: 'var(--color-background)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  color: 'var(--color-foreground)',
};
const tick = { fill: 'var(--color-muted)', fontSize: 12 };

function useChartHelpers() {
  const fmt = useFormat();
  return React.useMemo(() => {
    const compact = new Intl.NumberFormat(fmt.intlLocale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    return {
      monthLabel: (ym: string) =>
        fmt.date(`${ym}-15T12:00:00Z`, { month: 'short', year: '2-digit' }),
      axisMoney: (v: number) => compact.format(Math.round(v / 100)),
    };
  }, [fmt]);
}

/** Net worth history, category trends, year-over-year and CSV export (plan: advanced_reports). */
export function AdvancedReports() {
  const t = useTranslations('financePlus.reports');
  const { enabled } = useFeature('advanced_reports');
  return (
    <section aria-labelledby="advanced-reports-heading" className="grid gap-6">
      <h2 id="advanced-reports-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      {enabled === undefined ? (
        <LoadingState rows={2} />
      ) : !enabled ? (
        <UpsellState feature="advanced_reports" compact />
      ) : (
        <>
          <NetWorthCard />
          <CategoryTrendsCard />
          <YearOverYearCard />
          <ExportCard />
        </>
      )}
    </section>
  );
}

function NetWorthCard() {
  const t = useTranslations('financePlus.reports');
  const fmt = useFormat();
  const h = useChartHelpers();
  const { householdId } = useHousehold();
  const [months, setMonths] = React.useState(12);
  const range = React.useMemo(() => {
    const now = new Date();
    return {
      from: toYearMonth(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)),
      to: toYearMonth(now),
    };
  }, [months]);
  const query = useQuery(
    apiQuery(api, 'financePlus', 'netWorth', { params: { householdId }, query: range }),
  );

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>{t('netWorth')}</CardTitle>
          <CardDescription>{t('netWorthHint')}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="networth-range" className="text-sm text-muted">
            {t('period')}
          </Label>
          <NativeSelect
            id="networth-range"
            className="w-auto"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          >
            {[6, 12, 24, 36].map((m) => (
              <option key={m} value={m}>
                {t('lastMonths', { count: m })}
              </option>
            ))}
          </NativeSelect>
        </div>
      </CardHeader>
      <CardContent>
        <PlusQueryView query={query} feature="advanced_reports" rows={1}>
          {(r) => {
            if (r.points.length === 0) return <EmptyState title={t('empty')} />;
            const data = r.points.map((p) => ({
              month: p.month,
              label: h.monthLabel(p.month),
              value: p.netWorthMinor,
            }));
            const last = data[data.length - 1];
            const first = data[0];
            return (
              <>
                {last && first ? (
                  <p className="mb-3 text-sm">
                    <span className="text-2xl font-semibold tabular-nums">
                      {fmt.money(last.value, r.currency)}
                    </span>{' '}
                    <span className={last.value - first.value < 0 ? 'text-danger' : 'text-success'}>
                      {t('change', { amount: fmt.money(last.value - first.value, r.currency) })}
                    </span>
                  </p>
                ) : null}
                <figure className="h-64 w-full" aria-label={t('netWorthChart')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                      <CartesianGrid vertical={false} stroke="var(--color-border)" />
                      <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} />
                      <YAxis
                        tick={tick}
                        tickLine={false}
                        axisLine={false}
                        width={56}
                        tickFormatter={h.axisMoney}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v) => fmt.money(Number(v), r.currency)}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        name={t('netWorth')}
                        stroke="var(--color-primary)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </figure>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer rounded-sm text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    {t('showTable')}
                  </summary>
                  <table className="mt-2 w-full text-sm">
                    <caption className="sr-only">{t('netWorth')}</caption>
                    <thead className="text-left text-xs text-muted">
                      <tr>
                        <th scope="col" className="py-1 font-medium">
                          {t('month')}
                        </th>
                        <th scope="col" className="py-1 text-right font-medium">
                          {t('netWorth')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {data.map((d) => (
                        <tr key={d.month} className="border-t border-border">
                          <th scope="row" className="py-1 text-left font-normal">
                            {d.label}
                          </th>
                          <td className="py-1 text-right">{fmt.money(d.value, r.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </>
            );
          }}
        </PlusQueryView>
      </CardContent>
    </Card>
  );
}

function CategoryTrendsCard() {
  const t = useTranslations('financePlus.reports');
  const fmt = useFormat();
  const h = useChartHelpers();
  const label = useCategoryLabel();
  const { byId } = useCategoryOptions({ includeHidden: true });
  const { householdId } = useHousehold();
  const range = React.useMemo(() => {
    const now = new Date();
    return {
      from: toYearMonth(new Date(now.getFullYear(), now.getMonth() - 5, 1)),
      to: toYearMonth(now),
    };
  }, []);
  const query = useQuery(
    apiQuery(api, 'financePlus', 'categoryTrends', { params: { householdId }, query: range }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('trends')}</CardTitle>
        <CardDescription>{t('trendsHint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <PlusQueryView query={query} feature="advanced_reports" rows={2}>
          {(r) => {
            const top = r.categories
              .filter((c) => c.totalExpenseMinor !== 0)
              .sort((a, b) => Math.abs(b.totalExpenseMinor) - Math.abs(a.totalExpenseMinor))
              .slice(0, 6)
              .map((c, i) => ({
                key: c.categoryId ?? 'none',
                name: label(c.categoryId ? byId.get(c.categoryId) : null),
                color:
                  (c.categoryId ? byId.get(c.categoryId)?.color : null) ??
                  SERIES_COLORS[i % SERIES_COLORS.length] ??
                  '#1d5ef1',
                values: c.expenseMinor.map((v) => Math.abs(v)),
                total: Math.abs(c.totalExpenseMinor),
                average: Math.abs(c.averageExpenseMinor),
              }));
            if (top.length === 0) return <EmptyState title={t('empty')} />;
            const data = r.months.map((m, i) => ({
              label: h.monthLabel(m),
              ...Object.fromEntries(top.map((c) => [c.key, c.values[i] ?? 0])),
            }));
            return (
              <>
                <figure className="h-64 w-full" aria-label={t('trendsChart')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                      <CartesianGrid vertical={false} stroke="var(--color-border)" />
                      <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} />
                      <YAxis
                        tick={tick}
                        tickLine={false}
                        axisLine={false}
                        width={56}
                        tickFormatter={h.axisMoney}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v) => fmt.money(Number(v))}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {top.map((c) => (
                        <Line
                          key={c.key}
                          type="monotone"
                          dataKey={c.key}
                          name={c.name}
                          stroke={c.color}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </figure>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">{t('trends')}</caption>
                    <thead className="text-left text-xs text-muted">
                      <tr>
                        <th scope="col" className="py-1 pr-2 font-medium">
                          {t('category')}
                        </th>
                        <th scope="col" className="py-1 pr-2 text-right font-medium">
                          {t('average')}
                        </th>
                        <th scope="col" className="py-1 text-right font-medium">
                          {t('total')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {top.map((c) => (
                        <tr key={c.key} className="border-t border-border">
                          <th scope="row" className="py-1 pr-2 text-left font-normal">
                            <span
                              className="mr-2 inline-block size-2.5 rounded-full"
                              style={{ backgroundColor: c.color }}
                              aria-hidden
                            />
                            {c.name}
                          </th>
                          <td className="py-1 pr-2 text-right">{fmt.money(c.average)}</td>
                          <td className="py-1 text-right">{fmt.money(c.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          }}
        </PlusQueryView>
      </CardContent>
    </Card>
  );
}

function YearOverYearCard() {
  const t = useTranslations('financePlus.reports');
  const fmt = useFormat();
  const label = useCategoryLabel();
  const { byId } = useCategoryOptions({ includeHidden: true });
  const { householdId } = useHousehold();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = React.useState(currentYear);
  const query = useQuery(
    apiQuery(api, 'financePlus', 'yearOverYear', { params: { householdId }, query: { year } }),
  );
  const monthName = (m: number) =>
    fmt.date(new Date(Date.UTC(2020, m - 1, 15)), { month: 'short' });
  const pct = (v: number | null) =>
    v === null
      ? '–'
      : new Intl.NumberFormat(fmt.intlLocale, {
          style: 'percent',
          maximumFractionDigits: 0,
          signDisplay: 'exceptZero',
        }).format(v);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>{t('yoy')}</CardTitle>
          <CardDescription>
            {t('yoyHint', { year: String(year), previous: String(year - 1) })}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="yoy-year" className="text-sm text-muted">
            {t('year')}
          </Label>
          <NativeSelect
            id="yoy-year"
            className="w-auto"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <option key={i} value={currentYear - i}>
                {currentYear - i}
              </option>
            ))}
          </NativeSelect>
        </div>
      </CardHeader>
      <CardContent>
        <PlusQueryView query={query} feature="advanced_reports" rows={2}>
          {(r) => {
            const data = r.months.map((m) => ({
              label: monthName(m.month),
              current: Math.abs(m.expenseMinor),
              previous: Math.abs(m.previousExpenseMinor),
            }));
            const cats = r.categories
              .filter((c) => c.expenseMinor !== 0 || c.previousExpenseMinor !== 0)
              .sort((a, b) => Math.abs(b.expenseMinor) - Math.abs(a.expenseMinor))
              .slice(0, 10);
            return (
              <div className="grid gap-4">
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Kpi
                    label={t('incomeYear', { year: String(year) })}
                    value={fmt.money(Math.abs(r.totals.incomeMinor))}
                  />
                  <Kpi
                    label={t('incomeYear', { year: String(year - 1) })}
                    value={fmt.money(Math.abs(r.totals.previousIncomeMinor))}
                  />
                  <Kpi
                    label={t('expenseYear', { year: String(year) })}
                    value={fmt.money(Math.abs(r.totals.expenseMinor))}
                  />
                  <Kpi
                    label={t('expenseYear', { year: String(year - 1) })}
                    value={fmt.money(Math.abs(r.totals.previousExpenseMinor))}
                  />
                </dl>
                <figure className="h-64 w-full" aria-label={t('yoyChart')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                      <CartesianGrid vertical={false} stroke="var(--color-border)" />
                      <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} />
                      <YAxis
                        tick={tick}
                        tickLine={false}
                        axisLine={false}
                        width={56}
                        tickFormatter={(v: number) =>
                          new Intl.NumberFormat(fmt.intlLocale, { notation: 'compact' }).format(
                            Math.round(v / 100),
                          )
                        }
                      />
                      <Tooltip
                        cursor={{ fill: 'var(--color-surface-muted)' }}
                        contentStyle={tooltipStyle}
                        formatter={(v) => fmt.money(Number(v))}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar
                        dataKey="previous"
                        name={String(year - 1)}
                        fill="var(--color-muted)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="current"
                        name={String(year)}
                        fill="var(--color-danger)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </figure>
                {cats.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <caption className="mb-1 text-left text-sm font-medium">
                        {t('yoyCategories')}
                      </caption>
                      <thead className="text-left text-xs text-muted">
                        <tr>
                          <th scope="col" className="py-1 pr-2 font-medium">
                            {t('category')}
                          </th>
                          <th scope="col" className="py-1 pr-2 text-right font-medium">
                            {year - 1}
                          </th>
                          <th scope="col" className="py-1 pr-2 text-right font-medium">
                            {year}
                          </th>
                          <th scope="col" className="py-1 text-right font-medium">
                            {t('changeCol')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="tabular-nums">
                        {cats.map((c) => (
                          <tr key={c.categoryId ?? 'none'} className="border-t border-border">
                            <th scope="row" className="py-1 pr-2 text-left font-normal">
                              {label(c.categoryId ? byId.get(c.categoryId) : null)}
                            </th>
                            <td className="py-1 pr-2 text-right">
                              {fmt.money(Math.abs(c.previousExpenseMinor))}
                            </td>
                            <td className="py-1 pr-2 text-right">
                              {fmt.money(Math.abs(c.expenseMinor))}
                            </td>
                            <td
                              className={
                                c.change !== null && c.change > 0
                                  ? 'py-1 text-right text-danger'
                                  : 'py-1 text-right text-success'
                              }
                            >
                              {pct(c.change)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            );
          }}
        </PlusQueryView>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function ExportCard() {
  const t = useTranslations('financePlus.reports');
  const { householdId } = useHousehold();
  const accounts = useAccounts();
  const toastError = useToastError();
  const year = new Date().getFullYear();
  const [from, setFrom] = React.useState(`${year - 1}-01-01`);
  const [to, setTo] = React.useState(toLocalDate(new Date()));
  const [accountId, setAccountId] = React.useState('');

  const exportCsv = useMutation({
    mutationFn: () =>
      api.financePlus.exportTransactions({
        params: { householdId },
        query: { from, to, ...(accountId ? { accountId } : {}) },
      }),
    onSuccess: ({ fileName, content }) => {
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(t('exported', { file: fileName }));
    },
    onError: toastError,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('export')}</CardTitle>
        <CardDescription>{t('exportHint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to && from <= to) exportCsv.mutate();
          }}
        >
          <Field label={t('from')}>
            {(p) => (
              <Input
                type="date"
                {...p}
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            )}
          </Field>
          <Field label={t('to')}>
            {(p) => (
              <Input
                type="date"
                {...p}
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            )}
          </Field>
          <Field label={t('account')}>
            {(p) => (
              <NativeSelect {...p} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">{t('allAccounts')}</option>
                {(accounts.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Button type="submit" loading={exportCsv.isPending}>
            <Download aria-hidden />
            {t('download')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
