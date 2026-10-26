'use client';

import { apiQuery } from '@fp/api-client';
import { useQuery } from '@tanstack/react-query';
import { HardDrive } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Progress, Skeleton } from '@/components/ui/misc';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { cn, formatBytes } from '@/lib/utils';

export function UsageBar({ className }: { className?: string }) {
  const t = useTranslations('files');
  const locale = useLocale();
  const { householdId } = useHousehold();
  const query = useQuery(apiQuery(api, 'storage', 'usage', { params: { householdId } }));

  if (query.isPending) return <Skeleton className={cn('h-14', className)} />;
  if (query.isError) return null;

  const { usedBytes, quotaBytes, fileCount } = query.data;
  const pct = quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0;
  const tone = pct >= 100 ? 'exceeded' : pct > 80 ? 'warning' : 'default';
  const label = t('usageText', {
    used: formatBytes(usedBytes, locale),
    quota: formatBytes(quotaBytes, locale),
  });

  return (
    <div className={cn('grid gap-2 rounded-lg border border-border bg-surface p-3', className)}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <HardDrive className="size-4 text-muted" aria-hidden />
          {t('usage')}
        </span>
        <span
          className={cn(
            'text-muted',
            tone !== 'default' && 'font-medium text-warning',
            tone === 'exceeded' && 'text-danger',
          )}
        >
          {label} · {t('fileCount', { count: fileCount })}
        </span>
      </div>
      <Progress value={pct} tone={tone} aria-label={label} />
    </div>
  );
}
