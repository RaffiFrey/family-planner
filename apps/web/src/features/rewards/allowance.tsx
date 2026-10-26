'use client';

import { apiQuery, type Output } from '@fp/api-client';
import type { CurrencyCode } from '@fp/domain/money';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { CalendarClock, MoreVertical, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { toast } from 'sonner';
import { MemberAvatar } from '@/components/member-avatar';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MoneyInput } from '@/features/finance/money-input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';
import { todayLocal, useEarners, useInvalidateRewards, useIsRewardsAdult } from './hooks';

type Rule = Output<'rewards', 'allowanceRules'>[number];
type Kind = 'payout' | 'bonus' | 'expense' | 'correction';
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export function AllowanceSection() {
  const t = useTranslations('rewards.allowance');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId, memberById } = useHousehold();
  const adult = useIsRewardsAdult();
  const invalidate = useInvalidateRewards();
  const toastError = useToastError();
  const balances = useQuery(
    apiQuery(api, 'rewards', 'allowanceBalances', { params: { householdId } }),
  );
  const rules = useQuery(apiQuery(api, 'rewards', 'allowanceRules', { params: { householdId } }));
  const [ruleDialog, setRuleDialog] = React.useState<{ rule: Rule | null } | null>(null);
  const [deleting, setDeleting] = React.useState<Rule | null>(null);
  const [entryOpen, setEntryOpen] = React.useState(false);

  const removeRule = useMutation({
    mutationFn: (r: Rule) =>
      api.rewards.removeAllowanceRule({ params: { householdId, ruleId: r.id } }),
    onSuccess: async () => {
      setDeleting(null);
      toast.success(t('ruleDeleted'));
      await invalidate();
    },
    onError: toastError,
  });

  const money = (minor: number, currency: string) => fmt.money(minor, currency as CurrencyCode);

  return (
    <div className="grid gap-6">
      <section aria-labelledby="allowance-balances" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="allowance-balances" className="text-lg font-semibold">
            {t('balances')}
          </h2>
          {adult ? (
            <Button variant="secondary" size="sm" onClick={() => setEntryOpen(true)}>
              <Plus aria-hidden />
              {t('addEntry')}
            </Button>
          ) : null}
        </div>
        {balances.isPending ? (
          <LoadingState rows={2} />
        ) : balances.isError ? (
          <ErrorState error={balances.error} onRetry={() => void balances.refetch()} />
        ) : balances.data.length === 0 ? (
          <EmptyState icon={<Wallet />} title={t('noBalances')} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {balances.data.map((b) => {
              const m = memberById(b.memberId);
              return (
                <li key={`${b.memberId}-${b.currency}`}>
                  <Card>
                    <CardContent className="flex items-center gap-3 pt-4">
                      {m ? <MemberAvatar member={m} size="md" /> : null}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{m?.displayName ?? '?'}</p>
                        <p
                          className={cn(
                            'text-xl font-semibold tabular-nums',
                            b.balanceMinor < 0 && 'text-danger',
                          )}
                        >
                          {money(b.balanceMinor, b.currency)}
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

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>{t('rules')}</CardTitle>
          {adult ? (
            <Button size="sm" onClick={() => setRuleDialog({ rule: null })}>
              <Plus aria-hidden />
              {t('addRule')}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {rules.isPending ? (
            <LoadingState rows={2} />
          ) : rules.isError ? (
            <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />
          ) : rules.data.length === 0 ? (
            <p className="py-2 text-sm text-muted">{t('noRules')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {rules.data.map((r) => {
                const m = memberById(r.memberId);
                return (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    {m ? <MemberAvatar member={m} size="sm" /> : null}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {m?.displayName ?? '?'} · {money(r.amountMinor, r.currency)}
                      </p>
                      <p className="text-xs text-muted">
                        {r.interval === 'weekly'
                          ? t('weeklyOn', {
                              day: t(`weekdays.d${(r.weekday ?? 1) as (typeof WEEKDAYS)[number]}`),
                            })
                          : t('monthlyOn', { day: r.dayOfMonth ?? 1 })}
                        {r.active && r.nextPayday
                          ? ` · ${t('nextPayday', { date: fmt.date(r.nextPayday) })}`
                          : null}
                      </p>
                    </div>
                    {!r.active ? <Badge variant="secondary">{t('paused')}</Badge> : null}
                    {adult ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={tu('actions')}>
                            <MoreVertical aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setRuleDialog({ rule: r })}>
                            <Pencil aria-hidden />
                            {tc('edit')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(r)}>
                            <Trash2 aria-hidden />
                            {tc('delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Ledger />

      <Dialog open={ruleDialog !== null} onOpenChange={(o) => !o && setRuleDialog(null)}>
        <DialogContent>
          {ruleDialog ? (
            <RuleBody rule={ruleDialog.rule} onClose={() => setRuleDialog(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
        <DialogContent>
          <EntryBody onClose={() => setEntryOpen(false)} />
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('deleteRuleTitle')}
        confirmLabel={tc('delete')}
        destructive
        loading={removeRule.isPending}
        onConfirm={() => deleting && removeRule.mutate(deleting)}
      />
    </div>
  );
}

function Ledger() {
  const t = useTranslations('rewards.allowance');
  const tu = useTranslations('ui');
  const th = useTranslations('rewards.history');
  const fmt = useFormat();
  const { householdId, memberById } = useHousehold();
  const earners = useEarners();
  const [memberId, setMemberId] = React.useState('');
  const query = useInfiniteQuery({
    queryKey: ['rewards', 'allowanceLedger', { householdId, memberId }],
    queryFn: ({ pageParam }) =>
      api.rewards.allowanceLedger({
        params: { householdId },
        query: { cursor: pageParam, limit: 50, ...(memberId ? { memberId } : {}) },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-end justify-between gap-2">
        <CardTitle>{t('ledger')}</CardTitle>
        <Field label={th('member')} className="w-48">
          {(p) => (
            <NativeSelect {...p} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">{th('allMembers')}</option>
              {earners.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </CardHeader>
      <CardContent className="grid gap-3">
        {query.isPending ? (
          <LoadingState rows={3} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <p className="py-2 text-sm text-muted">{t('noEntries')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((e) => {
              const m = memberById(e.memberId);
              return (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  {m ? <MemberAvatar member={m} size="sm" /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {t(`kinds.${e.kind}`)}
                      {e.note ? ` · ${e.note}` : ''}
                    </p>
                    <p className="text-xs text-muted">
                      {m?.displayName ?? '?'} · {fmt.date(e.date)}
                      {e.ruleId ? (
                        <CalendarClock className="ml-1 inline size-3 align-[-1px]" aria-hidden />
                      ) : null}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'font-semibold tabular-nums',
                      e.amountMinor >= 0 ? 'text-success' : 'text-danger',
                    )}
                  >
                    {e.amountMinor > 0 ? '+' : ''}
                    {fmt.money(e.amountMinor, e.currency as CurrencyCode)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {query.hasNextPage ? (
          <Button
            variant="secondary"
            className="justify-self-center"
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {tu('loadMore')}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RuleBody({ rule, onClose }: { rule: Rule | null; onClose: () => void }) {
  const t = useTranslations('rewards.allowance');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const earners = useEarners();
  const invalidate = useInvalidateRewards();
  const toastError = useToastError();
  const [memberId, setMemberId] = React.useState(rule?.memberId ?? earners[0]?.id ?? '');
  const [amount, setAmount] = React.useState(
    rule ? fmt.moneyInput(rule.amountMinor, rule.currency as CurrencyCode) : '',
  );
  const [interval, setRuleInterval] = React.useState<'weekly' | 'monthly'>(
    rule?.interval ?? 'weekly',
  );
  const [weekday, setWeekday] = React.useState(String(rule?.weekday ?? 6));
  const [dayOfMonth, setDayOfMonth] = React.useState(String(rule?.dayOfMonth ?? 1));
  const [startsOn, setStartsOn] = React.useState(rule?.startsOn ?? todayLocal());
  const [active, setActive] = React.useState(rule?.active ?? true);
  const [error, setError] = React.useState<{ amount?: string; day?: string }>({});
  const id = React.useId();

  const save = useMutation({
    mutationFn: (amountMinor: number) => {
      const common = {
        amountMinor,
        interval,
        weekday: interval === 'weekly' ? Number(weekday) : null,
        dayOfMonth: interval === 'monthly' ? Number(dayOfMonth) : null,
        startsOn,
        active,
      };
      return rule
        ? api.rewards.updateAllowanceRule({
            params: { householdId, ruleId: rule.id },
            body: common,
          })
        : api.rewards.createAllowanceRule({
            params: { householdId },
            body: { ...common, memberId },
          });
    },
    onSuccess: async () => {
      toast.success(t('ruleSaved'));
      onClose();
      await invalidate();
    },
    onError: toastError,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{rule ? t('editRule') : t('addRule')}</DialogTitle>
        <DialogDescription className="sr-only">{t('rules')}</DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          let minor: number;
          try {
            minor = fmt.parseMoney(amount, (rule?.currency ?? fmt.currency) as CurrencyCode);
          } catch {
            setError({ amount: tu('invalidAmount') });
            return;
          }
          if (minor <= 0) {
            setError({ amount: tu('invalidAmount') });
            return;
          }
          const d = Number(dayOfMonth);
          if (interval === 'monthly' && (!Number.isInteger(d) || d < 1 || d > 31)) {
            setError({ day: tu('required') });
            return;
          }
          setError({});
          save.mutate(minor);
        }}
      >
        <Field label={t('member')}>
          {(p) => (
            <NativeSelect
              {...p}
              value={memberId}
              disabled={Boolean(rule)}
              onChange={(e) => setMemberId(e.target.value)}
            >
              {earners.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('amount')} hint={tu('moneyHint')} error={error.amount}>
            {(p) => (
              <MoneyInput
                {...p}
                currency={(rule?.currency ?? fmt.currency) as CurrencyCode}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('interval')}>
            {(p) => (
              <NativeSelect
                {...p}
                value={interval}
                onChange={(e) => setRuleInterval(e.target.value as 'weekly' | 'monthly')}
              >
                <option value="weekly">{t('intervals.weekly')}</option>
                <option value="monthly">{t('intervals.monthly')}</option>
              </NativeSelect>
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {interval === 'weekly' ? (
            <Field label={t('weekday')}>
              {(p) => (
                <NativeSelect {...p} value={weekday} onChange={(e) => setWeekday(e.target.value)}>
                  {WEEKDAYS.map((d) => (
                    <option key={d} value={d}>
                      {t(`weekdays.d${d}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          ) : (
            <Field label={t('dayOfMonth')} error={error.day}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                />
              )}
            </Field>
          )}
          <Field label={t('startsOn')}>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${id}-active`}
            checked={active}
            onCheckedChange={(v) => setActive(v === true)}
          />
          <Label htmlFor={`${id}-active`} className="font-normal">
            {t('active')}
          </Label>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
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

function EntryBody({ onClose }: { onClose: () => void }) {
  const t = useTranslations('rewards.allowance');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const earners = useEarners();
  const invalidate = useInvalidateRewards();
  const toastError = useToastError();
  const [memberId, setMemberId] = React.useState(earners[0]?.id ?? '');
  const [kind, setKind] = React.useState<Kind>('payout');
  const [amount, setAmount] = React.useState('');
  const [note, setNote] = React.useState('');
  const [date, setDate] = React.useState(todayLocal());
  const [error, setError] = React.useState<string | undefined>();

  const save = useMutation({
    mutationFn: (amountMinor: number) =>
      api.rewards.addAllowanceEntry({
        params: { householdId },
        body: { memberId, kind, amountMinor, note: note.trim() || null, date },
      }),
    onSuccess: async () => {
      toast.success(t('entrySaved'));
      onClose();
      await invalidate();
    },
    onError: toastError,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('addEntry')}</DialogTitle>
        <DialogDescription>{t('kindHint')}</DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          let minor: number;
          try {
            const trimmed = amount.trim();
            const negative = trimmed.startsWith('-');
            minor = fmt.parseMoney(negative ? trimmed.slice(1) : trimmed);
            if (negative) minor = -minor;
          } catch {
            setError(tu('invalidAmount'));
            return;
          }
          if (minor === 0 || (kind !== 'correction' && minor < 0)) {
            setError(tu('invalidAmount'));
            return;
          }
          setError(undefined);
          save.mutate(minor);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
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
          <Field label={t('kind')}>
            {(p) => (
              <NativeSelect {...p} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                {(['payout', 'bonus', 'expense', 'correction'] as const).map((k) => (
                  <option key={k} value={k}>
                    {t(`kinds.${k}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={t('amount')} hint={tu('moneyHint')} error={error}>
            {(p) => (
              <MoneyInput
                {...p}
                currency={fmt.currency}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('date')}>
            {(p) => (
              <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            )}
          </Field>
        </div>
        <Field label={t('note')}>
          {(p) => (
            <Input {...p} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          )}
        </Field>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
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
