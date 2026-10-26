'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type * as React from 'react';
import { useCallback } from 'react';
import { ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { UpsellState } from '@/components/upsell';
import { isPlanLimit } from '@/lib/errors';
import type { PlanFeature } from '@/lib/entitlements';

/** Invalidates financePlus (and optionally finance) queries after a mutation. */
export function useInvalidateFinancePlus(alsoFinance = false): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['financePlus'] });
    if (alsoFinance) await queryClient.invalidateQueries({ queryKey: ['finance'] });
  }, [queryClient, alsoFinance]);
}

/** Like QueryView, but a 402 renders the plan upsell instead of an error. */
export function PlusQueryView<T>({
  query,
  feature,
  rows,
  children,
}: {
  query: UseQueryResult<T>;
  feature: PlanFeature;
  rows?: number;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isPending) return <LoadingState rows={rows} />;
  if (query.isError) {
    if (isPlanLimit(query.error)) return <UpsellState feature={feature} />;
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  return <>{children(query.data)}</>;
}

/** Whole days from today (local) until a `YYYY-MM-DD` date; negative when past. */
export function daysUntil(localDate: string, now = new Date()): number {
  const [y, m, d] = localDate.split('-').map(Number);
  const target = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

/** Badge for a cancellation deadline: red when past/within 14 days, amber within 60. */
export function DeadlineBadge({ date, label }: { date: string; label: string }) {
  const t = useTranslations('financePlus.contracts');
  const days = daysUntil(date);
  const variant =
    days < 0 ? 'secondary' : days <= 14 ? 'danger' : days <= 60 ? 'warning' : 'outline';
  return (
    <Badge variant={variant} title={label}>
      {days < 0 ? t('deadlinePassed') : t('deadlineIn', { days })}
    </Badge>
  );
}

/** Midday UTC instant of a local date, so formatting never shifts the day. */
export function localDateInstant(localDate: string): string {
  return `${localDate}T12:00:00Z`;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const toYearMonth = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
export const toLocalDate = (d: Date) => `${toYearMonth(d)}-${pad2(d.getDate())}`;
