'use client';

import type { Action } from '@fp/domain/permissions';
import { Lock, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type * as React from 'react';
import { EmptyState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { useHousehold } from '@/features/household/household-context';
import { type PlanFeature, useFeature } from '@/lib/entitlements';
import { cn } from '@/lib/utils';

/** "This needs Family Plus/Pro" card with an upgrade link (or a hint to ask the owner). */
export function UpsellState({
  feature,
  className,
  compact = false,
}: {
  feature: PlanFeature;
  className?: string;
  compact?: boolean;
}) {
  const t = useTranslations('modules.upsell');
  const { can } = useHousehold();
  const canBill = can('household.billing');
  return (
    <div
      role="region"
      aria-label={t('title')}
      data-testid={`upsell-${feature}`}
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 text-center',
        compact ? 'px-4 py-5' : 'px-6 py-10',
        className,
      )}
    >
      <Sparkles className="size-7 text-primary" aria-hidden />
      <p className="font-semibold">{t('title')}</p>
      <p className="max-w-md text-sm text-muted">{t(`features.${feature}`)}</p>
      {canBill ? (
        <Button asChild>
          <Link href="/settings/billing">{t('cta')}</Link>
        </Button>
      ) : (
        <p className="text-xs text-muted">{t('askOwner')}</p>
      )}
    </div>
  );
}

/** Renders children only when the plan includes `feature`; otherwise an upsell. */
export function FeatureGate({
  feature,
  children,
  fallback,
}: {
  feature: PlanFeature;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { enabled } = useFeature(feature);
  if (enabled === undefined) return <LoadingState rows={2} />;
  if (!enabled) return <>{fallback ?? <UpsellState feature={feature} />}</>;
  return <>{children}</>;
}

/** Permission gate for a whole module page. */
export function ModuleGate({ action, children }: { action: Action; children: React.ReactNode }) {
  const t = useTranslations('modules');
  const { can } = useHousehold();
  if (!can(action)) return <EmptyState icon={<Lock />} title={t('forbidden')} className="mt-8" />;
  return <>{children}</>;
}
