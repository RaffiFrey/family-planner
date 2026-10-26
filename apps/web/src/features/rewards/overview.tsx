'use client';

import { apiQuery } from '@fp/api-client';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Medal, Plus, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { toast } from 'sonner';
import { MemberAvatar } from '@/components/member-avatar';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';
import { todayLocalDate } from '@/features/finance/hooks';
import { useEarners, useInvalidateRewards, useIsRewardsAdult } from './hooks';

/** Shifts a `YYYY-MM-DD` date by whole days (calendar arithmetic in UTC). */
function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO-8601 week number and week-year of a `YYYY-MM-DD` date. */
function isoWeek(date: string): { week: number; year: number } {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  return { week: Math.ceil(((d.getTime() - start) / 86_400_000 + 1) / 7), year };
}

export function RewardsOverview() {
  const t = useTranslations('rewards');
  const fmt = useFormat();
  const { householdId, memberById } = useHousehold();
  const adult = useIsRewardsAdult();
  const [adjusting, setAdjusting] = React.useState(false);
  const balances = useQuery(apiQuery(api, 'rewards', 'balances', { params: { householdId } }));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section aria-labelledby="balances-title" className="grid content-start gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="balances-title" className="text-lg font-semibold">
            {t('balances.title')}
          </h2>
          {adult ? (
            <Button variant="secondary" size="sm" onClick={() => setAdjusting(true)}>
              <Plus aria-hidden />
              {t('balances.adjust')}
            </Button>
          ) : null}
        </div>
        {balances.isPending ? (
          <LoadingState rows={3} />
        ) : balances.isError ? (
          <ErrorState error={balances.error} onRetry={() => void balances.refetch()} />
        ) : balances.data.length === 0 ? (
          <EmptyState icon={<Medal />} title={t('balances.empty')} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {balances.data.map((b) => {
              const m = memberById(b.memberId);
              return (
                <li key={b.memberId}>
                  <Card>
                    <CardContent className="flex items-center gap-3 pt-4">
                      {m ? <MemberAvatar member={m} size="lg" /> : null}
                      <div className="min-w-0">
                        <p className="truncate font-medium">{m?.displayName ?? '?'}</p>
                        <p className="text-2xl font-semibold tabular-nums">
                          {t('balances.points', { count: b.points })}
                        </p>
                        <p className="text-xs text-muted">
                          {t('balances.available', { count: fmt.number(b.available) })}
                          {b.reserved > 0
                            ? ` · ${t('balances.reserved', { count: fmt.number(b.reserved) })}`
                            : null}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <Leaderboard />
      {adult ? <AdjustDialog open={adjusting} onOpenChange={setAdjusting} /> : null}
    </div>
  );
}

function Leaderboard() {
  const t = useTranslations('rewards.leaderboard');
  const tb = useTranslations('rewards.balances');
  const fmt = useFormat();
  const { householdId, memberById } = useHousehold();
  const [period, setPeriod] = React.useState<'week' | 'month'>('week');
  /** Any day inside the shown period; `null` = the current one. */
  const [at, setAt] = React.useState<string | null>(null);
  const query = useQuery({
    ...apiQuery(api, 'rewards', 'leaderboard', {
      params: { householdId },
      query: at ? { period, at } : { period },
    }),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const today = todayLocalDate();
  const isCurrent = at === null || (data !== undefined && data.to >= today && data.from <= today);
  const periodLabel = data
    ? data.period === 'month'
      ? new Intl.DateTimeFormat(fmt.intlLocale, {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${data.from}T00:00:00Z`))
      : (() => {
          const w = isoWeek(data.from);
          return t('weekLabel', { week: String(w.week), year: String(w.year) });
        })()
    : '';
  const medal = ['text-yellow-500', 'text-slate-400', 'text-amber-700'];

  return (
    <Card className="content-start self-start">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="size-4 text-primary" aria-hidden />
          {t('title')}
        </CardTitle>
        <div role="radiogroup" aria-label={t('period')} className="flex gap-1">
          {(['week', 'month'] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              role="radio"
              aria-checked={period === p}
              variant={period === p ? 'default' : 'ghost'}
              onClick={() => {
                setPeriod(p);
                setAt(null);
              }}
            >
              {t(p)}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {data ? (
          <div className="mb-3 flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('previous')}
              onClick={() => setAt(shiftDay(data.from, -1))}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <div className="min-w-0 text-center" aria-live="polite">
              <p className="text-sm font-medium" data-testid="leaderboard-period">
                {periodLabel}
              </p>
              <p className="text-xs text-muted">
                {fmt.date(data.from)} – {fmt.date(data.to)}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {!isCurrent ? (
                <Button variant="ghost" size="sm" onClick={() => setAt(null)}>
                  {t('current')}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('next')}
                disabled={isCurrent}
                onClick={() => setAt(shiftDay(data.to, 1))}
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
          </div>
        ) : null}
        {query.isPending ? (
          <LoadingState rows={3} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.rows.length === 0 ? (
          <p className="py-4 text-sm text-muted">{t('empty')}</p>
        ) : (
          <>
            <ol className="grid gap-2">
              {query.data.rows.map((r) => {
                const m = memberById(r.memberId);
                return (
                  <li key={r.memberId} className="flex items-center gap-3">
                    <span
                      className={cn(
                        'w-6 text-center font-semibold tabular-nums',
                        medal[r.rank - 1] ?? 'text-muted',
                      )}
                      aria-label={t('rank', { rank: r.rank })}
                    >
                      {r.rank}
                    </span>
                    {m ? <MemberAvatar member={m} size="sm" /> : null}
                    <span className="min-w-0 flex-1 truncate">{m?.displayName ?? '?'}</span>
                    <span className="text-sm font-medium tabular-nums">
                      {tb('points', { count: r.points })}
                    </span>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AdjustBody({ onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('rewards.adjust');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const { householdId } = useHousehold();
  const earners = useEarners();
  const invalidate = useInvalidateRewards();
  const toastError = useToastError();
  const [memberId, setMemberId] = React.useState(earners[0]?.id ?? '');
  const [delta, setDelta] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [errors, setErrors] = React.useState<{ delta?: string; reason?: string }>({});

  const save = useMutation({
    mutationFn: (n: number) =>
      api.rewards.adjustPoints({
        params: { householdId },
        body: { memberId, delta: n, reason: reason.trim() },
      }),
    onSuccess: async () => {
      toast.success(t('saved'));
      onOpenChange(false);
      await invalidate();
    },
    onError: toastError,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('title')}</DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(delta.trim());
          const next: typeof errors = {};
          if (!delta.trim() || !Number.isInteger(n) || n === 0 || Math.abs(n) > 10_000)
            next.delta = t('invalid');
          if (!reason.trim()) next.reason = tu('required');
          setErrors(next);
          if (Object.keys(next).length === 0) save.mutate(n);
        }}
      >
        <Field label={t('member')}>
          {(p) => (
            <NativeSelect {...p} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              {earners.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label={t('delta')} hint={t('deltaHint')} error={errors.delta}>
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('reason')} error={errors.reason}>
          {(p) => (
            <Input
              {...p}
              maxLength={200}
              placeholder={t('reasonPlaceholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button type="submit" loading={save.isPending}>
            {tc('save')}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function AdjustDialog(props: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <AdjustBody {...props} />
      </DialogContent>
    </Dialog>
  );
}
