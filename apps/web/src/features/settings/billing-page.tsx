'use client';

import { apiQuery } from '@fp/api-client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, ExternalLink, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { formatBytes } from '@/lib/utils';
import { Section } from './section';

type PaidPlan = 'plus' | 'pro';
type Interval = 'month' | 'year';

const ALL_FEATURES = [
  'contracts',
  'ocr',
  'vault',
  'advanced_reports',
  'rewards',
  'bank_sync',
  'ai_assistant',
] as const;

export function BillingPage() {
  const t = useTranslations('settings.billing');
  const tp = useTranslations('plans');
  const locale = useLocale();
  const { householdId, can } = useHousehold();
  const fmt = useFormat();
  const toastError = useToastError();
  const canBill = can('household.billing');
  const query = useQuery(apiQuery(api, 'billing', 'subscription', { params: { householdId } }));

  const checkout = useMutation({
    mutationFn: (v: { plan: PaidPlan; interval: Interval }) =>
      api.billing.checkout({ params: { householdId }, body: v }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: toastError,
  });

  const portal = useMutation({
    mutationFn: () => api.billing.portal({ params: { householdId } }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: toastError,
  });

  if (query.isPending) return <LoadingState rows={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const sub = query.data;
  const ent = sub.entitlements;
  const pending = checkout.isPending ? checkout.variables : undefined;
  const upgrades: PaidPlan[] =
    sub.plan === 'free' ? ['plus', 'pro'] : sub.plan === 'plus' ? ['pro'] : [];

  return (
    <div className="grid gap-6">
      <Section
        title={t('currentPlan')}
        description={t('description')}
        actions={
          canBill && sub.provider === 'stripe' ? (
            <Button variant="secondary" loading={portal.isPending} onClick={() => portal.mutate()}>
              <ExternalLink aria-hidden />
              {t('manage')}
            </Button>
          ) : null
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl font-semibold">{tp(sub.plan)}</span>
          <Badge
            variant={
              sub.status === 'past_due'
                ? 'danger'
                : sub.status === 'active' || sub.status === 'trialing'
                  ? 'success'
                  : 'secondary'
            }
          >
            {t(`status.${sub.status}`)}
          </Badge>
        </div>
        <div className="mt-2 grid gap-1 text-sm text-muted">
          {sub.currentPeriodEnd ? (
            <p>
              {sub.cancelAtPeriodEnd
                ? t('ends', { date: fmt.date(sub.currentPeriodEnd) })
                : t('renews', { date: fmt.date(sub.currentPeriodEnd) })}
            </p>
          ) : null}
          {sub.provider ? (
            <p>{t('provider', { provider: t(`providers.${sub.provider}`) })}</p>
          ) : null}
        </div>

        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t('limits')}</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">{t('maxMembers')}</dt>
              <dd>{ent.maxMembers}</dd>
              <dt className="text-muted">{t('maxAccounts')}</dt>
              <dd>{ent.maxAccounts ?? t('unlimited')}</dd>
              <dt className="text-muted">{t('storage')}</dt>
              <dd>{formatBytes(ent.storageQuotaBytes, locale)}</dd>
              <dt className="text-muted">{t('history')}</dt>
              <dd>
                {ent.historyMonths === null
                  ? t('unlimited')
                  : t('months', { count: ent.historyMonths })}
              </dd>
            </dl>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t('features')}</h3>
            <ul className="grid gap-1 text-sm">
              {ALL_FEATURES.map((f) => {
                const has = ent.features.includes(f);
                return (
                  <li key={f} className={has ? '' : 'text-muted line-through'}>
                    <span className="inline-flex items-center gap-2">
                      {has ? (
                        <Check className="size-4 text-success" aria-hidden />
                      ) : (
                        <span className="inline-block size-4" aria-hidden />
                      )}
                      {t(`feature.${f}`)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </Section>

      {upgrades.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {upgrades.map((plan) => (
            <Section
              key={plan}
              title={
                <span className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" aria-hidden />
                  {tp(plan)}
                </span>
              }
              description={plan === 'plus' ? t('plusPitch') : t('proPitch')}
            >
              {canBill ? (
                <div className="flex flex-wrap gap-2">
                  {(['month', 'year'] as const).map((interval) => (
                    <Button
                      key={interval}
                      variant={interval === 'year' ? 'default' : 'secondary'}
                      disabled={checkout.isPending}
                      loading={pending?.plan === plan && pending.interval === interval}
                      onClick={() => checkout.mutate({ plan, interval })}
                    >
                      {t('upgrade')} · {interval === 'month' ? t('monthly') : t('yearly')}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">{t('noPermission')}</p>
              )}
            </Section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
