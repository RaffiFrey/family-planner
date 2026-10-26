'use client';

import { apiQuery } from '@fp/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, ShieldCheck, ShieldOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { Section } from './section';

const HOUR_OPTIONS = [1, 4, 24, 48, 72] as const;

/** Owner/admin grant time-boxed read access for the support team (audited server-side). */
export function SupportAccessSection() {
  const t = useTranslations('integrations.support');
  const tc = useTranslations('common');
  const fmt = useFormat();
  const { householdId, memberById } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const queryOptions = apiQuery(api, 'households', 'getSupportAccess', { params: { householdId } });
  const query = useQuery(queryOptions);
  const [hours, setHours] = React.useState<number>(24);
  const [reason, setReason] = React.useState('');
  const [confirmRevoke, setConfirmRevoke] = React.useState(false);

  const grant = useMutation({
    mutationFn: () =>
      api.households.grantSupportAccess({
        params: { householdId },
        body: { hours, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryOptions.queryKey, data);
      setReason('');
      toast.success(t('granted'));
    },
    onError: toastError,
  });

  const revoke = useMutation({
    mutationFn: () => api.households.revokeSupportAccess({ params: { householdId } }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryOptions.queryKey, data);
      setConfirmRevoke(false);
      toast.success(t('revoked'));
    },
    onError: toastError,
  });

  return (
    <Section title={t('title')} description={t('description')}>
      {query.isPending ? (
        <LoadingState rows={1} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.active && query.data.expiresAt ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-warning/40 bg-warning/5 p-3">
          <div className="grid gap-1 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <ShieldCheck className="size-4 text-warning" aria-hidden />
              {t('active', { date: fmt.dateTime(query.data.expiresAt) })}
            </p>
            {query.data.grantedByMemberId ? (
              <p className="text-muted">
                {t('activeBy', {
                  name: memberById(query.data.grantedByMemberId)?.displayName ?? '–',
                })}
              </p>
            ) : null}
            {query.data.reason ? (
              <p className="text-muted">
                {t('reason')}: {query.data.reason}
              </p>
            ) : null}
          </div>
          <Button variant="destructive" onClick={() => setConfirmRevoke(true)}>
            <ShieldOff aria-hidden />
            {t('revoke')}
          </Button>
        </div>
      ) : (
        <form
          className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            grant.mutate();
          }}
        >
          <p className="flex items-center gap-2 text-sm text-muted sm:col-span-3">
            <Badge variant="secondary">
              <LifeBuoy aria-hidden />
              {tc('none')}
            </Badge>
            {t('inactive')}
          </p>
          <Field label={t('hours')}>
            {(p) => (
              <NativeSelect
                {...p}
                value={String(hours)}
                onChange={(e) => setHours(Number(e.target.value))}
              >
                {HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {t('hoursOption', { count: h })}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={`${t('reason')} (${tc('optional')})`}>
            {(p) => (
              <Input
                {...p}
                maxLength={300}
                value={reason}
                placeholder={t('reasonPlaceholder')}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" loading={grant.isPending}>
            {t('grant')}
          </Button>
        </form>
      )}
      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title={t('revokeTitle')}
        description={t('revokeBody')}
        confirmLabel={t('revoke')}
        destructive
        loading={revoke.isPending}
        onConfirm={() => revoke.mutate()}
      />
    </Section>
  );
}
