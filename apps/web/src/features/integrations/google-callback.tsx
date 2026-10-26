'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { clearGooglePending, readGooglePending } from './google-pending';

/**
 * Google redirects here with `code` + `state` (or `error`). We hand both to the API, which
 * exchanges the code and runs the first sync, then go back to the integrations page.
 */
export function GoogleCallback() {
  const t = useTranslations('integrations.callback');
  const tg = useTranslations('integrations.google');
  const search = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const { householdId: currentHouseholdId } = useHousehold();
  const [asyncError, setAsyncError] = React.useState<string | null>(null);
  const started = React.useRef(false);
  const code = search.get('code');
  const state = search.get('state');
  const oauthError = search.get('error');
  const inputError = oauthError
    ? oauthError === 'access_denied'
      ? t('denied')
      : `${t('failed')} (${oauthError})`
    : !code || !state
      ? t('missing')
      : null;
  const error = inputError ?? asyncError;

  React.useEffect(() => {
    if (!code || !state || oauthError) {
      clearGooglePending();
      return;
    }
    // Strict mode runs effects twice in dev; the code is single-use.
    if (started.current) return;
    started.current = true;
    const pending = readGooglePending();
    const householdId =
      pending && pending.state === state ? pending.householdId : currentHouseholdId;
    void (async () => {
      try {
        const res = await api.calendarSync.googleCallback({
          params: { householdId },
          body: { code, state },
        });
        clearGooglePending();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['calendarSync'] }),
          queryClient.invalidateQueries({ queryKey: ['calendar'] }),
        ]);
        toast.success(t('success'));
        if (res.connection.lastError) toast.warning(res.connection.lastError);
        router.replace('/settings/integrations');
      } catch (err) {
        clearGooglePending();
        setAsyncError(errorMessage(err));
      }
    })();
  }, [code, state, oauthError, t, currentHouseholdId, queryClient, router, errorMessage]);

  return (
    <section className="rounded-lg border border-border bg-surface p-6" aria-live="polite">
      {error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <div className="flex items-center gap-2 font-semibold text-danger">
            <AlertTriangle className="size-5" aria-hidden />
            {t('failed')}
          </div>
          <p className="text-sm text-muted">{error}</p>
          <Button asChild variant="secondary">
            <Link href="/settings/integrations">{t('back')}</Link>
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
          <div>
            <h2 className="font-semibold">{t('title')}</h2>
            <p className="text-sm text-muted">{tg('description')}</p>
          </div>
        </div>
      )}
    </section>
  );
}
