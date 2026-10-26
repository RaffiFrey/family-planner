'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCwIcon } from 'lucide-react';
import * as React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ErrorState, PageHeader } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/table';
import { api } from '@/lib/api';
import { fmtBytes, fmtNumber, planLabel } from '@/lib/format';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="grid gap-0.5 p-3">
        <p className="text-xs text-muted">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {sub ? <p className="text-xs text-muted">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

const PLAN_ORDER = ['free', 'plus', 'pro'];

export function Dashboard() {
  const kpis = useQuery({ queryKey: ['kpis'], queryFn: () => api.kpis() });

  const paying = React.useMemo(() => {
    const entries = Object.entries(kpis.data?.paying ?? {});
    entries.sort(([a], [b]) => {
      const ia = PLAN_ORDER.indexOf(a);
      const ib = PLAN_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
    return entries.map(([plan, count]) => ({ plan: planLabel(plan), count }));
  }, [kpis.data]);
  const totalPaying = paying.reduce((s, p) => s + p.count, 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Business KPIs across all households."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void kpis.refetch()}
            disabled={kpis.isFetching}
          >
            <RefreshCwIcon className={kpis.isFetching ? 'animate-spin' : undefined} />
            Refresh
          </Button>
        }
      />
      {kpis.isPending ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : kpis.isError ? (
        <Card>
          <ErrorState error={kpis.error} onRetry={() => void kpis.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-4" data-testid="kpis">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Stat label="Users" value={fmtNumber(kpis.data.users)} />
            <Stat label="Households" value={fmtNumber(kpis.data.households)} />
            <Stat
              label="Active households (30d)"
              value={fmtNumber(kpis.data.activeHouseholds30d)}
              sub={
                kpis.data.households > 0
                  ? `${((kpis.data.activeHouseholds30d / kpis.data.households) * 100).toFixed(1)} % of all`
                  : undefined
              }
            />
            <Stat label="Signups (7d)" value={fmtNumber(kpis.data.signups7d)} />
            <Stat label="Paying households" value={fmtNumber(totalPaying)} />
            <Stat label="Storage used" value={fmtBytes(kpis.data.storageBytes)} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Paying households by plan</CardTitle>
            </CardHeader>
            <CardContent>
              {paying.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">No paying households yet.</p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
                  <div
                    className="h-64"
                    role="img"
                    aria-label="Bar chart of paying households per plan"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={paying}
                        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                        barCategoryGap="30%"
                      >
                        <CartesianGrid
                          vertical={false}
                          stroke="var(--color-border)"
                          strokeDasharray="0"
                        />
                        <XAxis
                          dataKey="plan"
                          tickLine={false}
                          axisLine={{ stroke: 'var(--color-border)' }}
                          tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                        />
                        <YAxis
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                          width={40}
                          tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                        />
                        <Tooltip
                          cursor={{ fill: 'var(--color-surface-muted)' }}
                          contentStyle={{
                            background: 'var(--color-background)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 6,
                            fontSize: 12,
                            color: 'var(--color-foreground)',
                          }}
                          labelStyle={{ color: 'var(--color-foreground)', fontWeight: 600 }}
                          itemStyle={{ color: 'var(--color-foreground)' }}
                          formatter={(v) => [fmtNumber(Number(v)), 'Households']}
                        />
                        <Bar
                          dataKey="count"
                          name="Households"
                          fill="var(--color-primary)"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={64}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Table view of the same data (accessible alternative to the chart). */}
                  <table className="self-start text-sm">
                    <thead>
                      <tr className="text-xs text-muted">
                        <th className="py-1 text-left font-medium">Plan</th>
                        <th className="py-1 text-right font-medium">Households</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paying.map((p) => (
                        <tr key={p.plan} className="border-t border-border">
                          <td className="py-1">{p.plan}</td>
                          <td className="py-1 text-right tabular-nums">{fmtNumber(p.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
