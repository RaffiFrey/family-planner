'use client';

import { ApiError } from '@fp/api-client';
import { AlertTriangle, Clock, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useHousehold } from '@/features/household/household-context';
import { isPlanLimit, useErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

/** Maps assistant API errors (402/403/429/502/503 and domain codes) to specific messages. */
export function useAssistantErrorMessage(): (err: unknown) => string {
  const t = useTranslations('assistant.errors');
  const generic = useErrorMessage();
  return useCallback(
    (err: unknown) => {
      if (!(err instanceof ApiError)) return generic(err);
      if (isPlanLimit(err)) return t('planLimit');
      switch (err.problem.code) {
        case 'assistant_disabled':
          return t('disabled');
        case 'assistant_quota':
          return t('quota');
        case 'assistant_busy':
          return t('busy');
        case 'assistant_refused':
          return t('refused');
        case 'assistant_invalid_output':
        case 'assistant_upstream':
          return t('upstream');
        case 'receipt_unreadable':
          return t('unreadable');
        case 'file_not_ready':
          return t('fileNotReady');
        case 'unsupported_file':
          return t('unsupportedFile');
        case 'proposal_closed':
          return t('proposalClosed');
        case 'account_required':
          return t('accountRequired');
        case 'calendar_read_only':
          return t('calendarReadOnly');
        case 'unavailable':
          return t('notConfigured');
        default:
          break;
      }
      switch (err.status) {
        case 403:
          return t('forbidden');
        case 429:
          return t('quota');
        case 502:
          return t('upstream');
        case 503:
          return t('notConfigured');
        default:
          return generic(err);
      }
    },
    [t, generic],
  );
}

/** Inline alert for a failed assistant request; plan limits get an upgrade link. */
export function AssistantErrorAlert({ error, className }: { error: unknown; className?: string }) {
  const message = useAssistantErrorMessage();
  const tu = useTranslations('ui');
  const { can } = useHousehold();
  const planLimit = isPlanLimit(error);
  const transient =
    error instanceof ApiError &&
    (error.status === 429 || error.status === 503 || error.status === 502);
  const Icon = planLimit ? Sparkles : transient ? Clock : AlertTriangle;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-md border p-3 text-sm',
        planLimit
          ? 'border-primary/30 bg-primary/5'
          : transient
            ? 'border-warning/40 bg-warning/10'
            : 'border-danger/40 bg-danger/5',
        className,
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          planLimit ? 'text-primary' : transient ? 'text-warning' : 'text-danger',
        )}
        aria-hidden
      />
      <p className="min-w-0 flex-1">{message(error)}</p>
      {planLimit && can('household.billing') ? (
        <Button asChild size="sm">
          <Link href="/settings/billing">{tu('upgrade')}</Link>
        </Button>
      ) : null}
    </div>
  );
}
