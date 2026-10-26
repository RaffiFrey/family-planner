'use client';

import type { HomeAsset } from '@fp/contracts';
import { useQuery } from '@tanstack/react-query';
import { Car, Home, Package, Plus, ShieldCheck, WashingMachine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { ModuleGate } from '@/components/upsell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { addDaysIso, todayIso } from '@/features/health/dates';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';
import { ASSET_KINDS, type AssetKind, AssetDialog } from './asset-dialog';
import { MaintenanceList, useAssets } from './maintenance';

export const KIND_ICON = {
  home: Home,
  vehicle: Car,
  appliance: WashingMachine,
  other: Package,
} as const;

export function HomeAssetsPage() {
  const t = useTranslations('homeAssets');
  return (
    <ModuleGate action="home.read">
      <PageHeader title={t('title')} description={t('description')} />
      <Tabs defaultValue="assets">
        <TabsList>
          <TabsTrigger value="assets">{t('tabs.assets')}</TabsTrigger>
          <TabsTrigger value="maintenance">{t('tabs.maintenance')}</TabsTrigger>
          <TabsTrigger value="warranties">{t('tabs.warranties')}</TabsTrigger>
        </TabsList>
        <TabsContent value="assets">
          <AssetsGrid />
        </TabsContent>
        <TabsContent value="maintenance">
          <MaintenanceList />
        </TabsContent>
        <TabsContent value="warranties">
          <Warranties />
        </TabsContent>
      </Tabs>
    </ModuleGate>
  );
}

/** Warranty badge: expired / ending within 90 days / until. */
export function WarrantyBadge({ until }: { until: string | null }) {
  const t = useTranslations('homeAssets.warranty');
  const fmt = useFormat();
  if (!until) return null;
  const today = todayIso();
  if (until < today) return <Badge variant="outline">{t('expired')}</Badge>;
  if (until <= addDaysIso(today, 90))
    return (
      <Badge variant="warning">
        <ShieldCheck aria-hidden />
        {t('endsSoon', { date: fmt.date(until) })}
      </Badge>
    );
  return (
    <Badge variant="secondary">
      <ShieldCheck aria-hidden />
      {t('until', { date: fmt.date(until) })}
    </Badge>
  );
}

function AssetsGrid() {
  const t = useTranslations('homeAssets');
  const { householdId, can } = useHousehold();
  const canWrite = can('home.write');
  const query = useAssets();
  const plans = useQuery({
    queryKey: ['home', 'maintenance.list', householdId, null],
    queryFn: () => api.home.maintenance.list({ params: { householdId }, query: {} }),
  });
  const [kind, setKind] = React.useState<AssetKind | ''>('');
  const [adding, setAdding] = React.useState(false);

  const addButton = canWrite ? (
    <Button onClick={() => setAdding(true)}>
      <Plus aria-hidden />
      {t('assets.add')}
    </Button>
  ) : null;

  if (query.isPending) return <LoadingState rows={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const visible = query.data
    .filter((a) => !kind || a.kind === kind)
    .sort((a, b) => a.name.localeCompare(b.name));
  const planStats = (id: string) => {
    const own = (plans.data ?? []).filter((p) => p.assetId === id);
    return {
      count: own.length,
      attention: own.filter((p) => p.status === 'due' || p.status === 'upcoming').length,
      due: own.some((p) => p.status === 'due'),
    };
  };

  return (
    <div className="grid gap-4">
      {query.data.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect
            aria-label={t('assets.kind')}
            value={kind}
            onChange={(e) => setKind(e.target.value as AssetKind | '')}
            className="w-auto"
          >
            <option value="">{t('allKinds')}</option>
            {ASSET_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </NativeSelect>
          <div className="ml-auto">{addButton}</div>
        </div>
      ) : null}
      {query.data.length === 0 ? (
        <EmptyState
          icon={<Car />}
          title={t('assets.empty')}
          description={t('assets.emptyHint')}
          action={addButton}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((a) => (
            <li key={a.id}>
              <AssetCard asset={a} stats={planStats(a.id)} />
            </li>
          ))}
        </ul>
      )}
      <AssetDialog
        open={adding}
        onOpenChange={setAdding}
        asset={null}
        defaultKind={kind || 'home'}
      />
    </div>
  );
}

function AssetCard({
  asset,
  stats,
}: {
  asset: HomeAsset;
  stats: { count: number; attention: number; due: boolean };
}) {
  const t = useTranslations('homeAssets');
  const Icon = KIND_ICON[asset.kind];
  const firstDetails = Object.entries(asset.details).slice(0, 2);
  return (
    <Link
      href={`/home-assets/${asset.id}`}
      aria-label={t('assets.open', { name: asset.name })}
      className="block h-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Card className="h-full transition-colors hover:bg-surface-muted">
        <CardContent className="grid gap-2 pt-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{asset.name}</p>
              <p className="text-xs text-muted">{t(`kinds.${asset.kind}`)}</p>
            </div>
          </div>
          {firstDetails.length > 0 ? (
            <p className="truncate text-sm text-muted">
              {firstDetails.map(([k, v]) => `${k}: ${v}`).join(' · ')}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant={stats.due ? 'danger' : stats.attention > 0 ? 'warning' : 'secondary'}
              className={cn(stats.count === 0 && 'opacity-70')}
            >
              {t('assets.plansCount', { count: stats.count })}
            </Badge>
            <WarrantyBadge until={asset.warrantyUntil} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Warranties() {
  const t = useTranslations('homeAssets.warranty');
  const { householdId } = useHousehold();
  const [days, setDays] = React.useState(90);
  const query = useQuery({
    queryKey: ['home', 'assets.warranties', householdId, days],
    queryFn: () => api.home.assets.warranties({ params: { householdId }, query: { days } }),
  });
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{t('title')}</h2>
        <NativeSelect
          aria-label={t('within')}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="ml-auto w-auto"
        >
          {[30, 90, 180, 365].map((d) => (
            <option key={d} value={d}>
              {t('days', { count: d })}
            </option>
          ))}
        </NativeSelect>
      </div>
      {query.isPending ? (
        <LoadingState rows={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState icon={<ShieldCheck />} title={t('empty')} />
      ) : (
        <ul className="grid gap-2">
          {query.data.map((a) => {
            const Icon = KIND_ICON[a.kind];
            return (
              <li key={a.id}>
                <Link
                  href={`/home-assets/${a.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Icon className="size-5 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                  <WarrantyBadge until={a.warrantyUntil} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
