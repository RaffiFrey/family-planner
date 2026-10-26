'use client';

import { useTranslations } from 'next-intl';
import type * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/misc';
import { useFormat } from '@/lib/use-format';
import { type BudgetStatus, useCategoryLabel, useCategoryOptions } from './hooks';

const levelBadge = { ok: 'success', warning: 'warning', exceeded: 'danger' } as const;

/** One budget with progress bar, colored by level (ok / warning / exceeded). */
export function BudgetRow({
  status,
  actions,
}: {
  status: BudgetStatus;
  actions?: React.ReactNode;
}) {
  const t = useTranslations('finance.budgets');
  const tl = useTranslations('budgetLevels');
  const fmt = useFormat();
  const label = useCategoryLabel();
  const { byId } = useCategoryOptions({ includeHidden: true });
  const spent = Math.abs(status.spentMinor);
  const name = label(byId.get(status.budget.categoryId));
  const pct = Math.round(status.ratio * 100);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{name}</span>
          <Badge variant={levelBadge[status.level]}>{tl(status.level)}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm tabular-nums">
            {t('ofLimit', { spent: fmt.money(spent), available: fmt.money(status.availableMinor) })}
          </span>
          {actions}
        </div>
      </div>
      <Progress value={pct} tone={status.level} aria-label={`${name}: ${pct}%`} />
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
        <span>
          {status.remainingMinor >= 0
            ? `${t('remaining')}: ${fmt.money(status.remainingMinor)}`
            : t('overBy', { amount: fmt.money(Math.abs(status.remainingMinor)) })}
        </span>
        {status.rolloverMinor !== 0 ? (
          <span>{t('rolloverAmount', { amount: fmt.money(status.rolloverMinor) })}</span>
        ) : null}
      </div>
    </div>
  );
}
