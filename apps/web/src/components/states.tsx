'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { AlertTriangle, Inbox } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type * as React from 'react';
import { useErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Skeleton } from './ui/misc';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const t = useTranslations('common');
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center',
        className,
      )}
    >
      <div className="text-muted [&_svg]:size-8" aria-hidden>
        {icon ?? <Inbox />}
      </div>
      <p className="font-medium">{title ?? t('empty')}</p>
      {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useTranslations('common');
  const message = useErrorMessage();
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-danger/40 bg-danger/5 px-6 py-8 text-center',
        className,
      )}
    >
      <AlertTriangle className="size-6 text-danger" aria-hidden />
      <p className="text-sm">{message(error)}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('retry')}
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingState({ rows = 3, className }: { rows?: number; className?: string }) {
  const t = useTranslations('common');
  return (
    <div className={cn('grid gap-2', className)} aria-busy="true">
      <span className="sr-only" role="status">
        {t('loading')}
      </span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** Renders loading / error states for a query and hands successful data to children. */
export function QueryView<T>({
  query,
  children,
  loading,
  rows,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => React.ReactNode;
  loading?: React.ReactNode;
  rows?: number;
}) {
  if (query.isPending) return <>{loading ?? <LoadingState rows={rows} />}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <>{children(query.data)}</>;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
