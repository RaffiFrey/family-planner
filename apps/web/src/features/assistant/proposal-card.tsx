'use client';

import { apiQuery } from '@fp/api-client';
import type { AssistantAction, AssistantProposal } from '@fp/contracts';
import { isCurrencyCode } from '@fp/domain/money';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ExternalLink,
  ListPlus,
  type LucideIcon,
  Receipt,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';
import { AssistantErrorAlert } from './assistant-errors';

const ICONS: Record<AssistantAction['type'], LucideIcon> = {
  create_event: CalendarDays,
  create_task: CheckSquare,
  add_list_items: ListPlus,
  create_transaction: Receipt,
};

/** Modules a created entity invalidates after applying. */
const MODULE_OF: Record<AssistantAction['type'], string> = {
  create_event: 'calendar',
  create_task: 'tasks',
  add_list_items: 'lists',
  create_transaction: 'finance',
};

function resultHref(type: string, id: string, action: AssistantAction | undefined): string {
  switch (type) {
    case 'create_event':
      return '/calendar';
    case 'create_task':
      return `/tasks/${id}`;
    case 'add_list_items':
      return action?.type === 'add_list_items' ? `/lists/${action.listId}` : '/lists';
    case 'create_transaction':
      return '/finance/transactions';
    default:
      return '/';
  }
}

/** Shows a proposal's actions with checkboxes and issues; applies a selection or discards it. */
export function ProposalCard({
  proposal,
  onChange,
}: {
  proposal: AssistantProposal;
  onChange: (p: AssistantProposal) => void;
}) {
  const t = useTranslations('assistant.proposal');
  const { householdId, can } = useHousehold();
  const queryClient = useQueryClient();
  const pending = proposal.status === 'pending';
  const appliedIndexes = React.useMemo(
    () => new Set(proposal.results.map((r) => r.index)),
    [proposal.results],
  );
  const [selected, setSelected] = React.useState<Set<number>>(
    () => new Set(proposal.actions.map((_, i) => i).filter((i) => !appliedIndexes.has(i))),
  );
  const needsAccount = proposal.actions.some(
    (a, i) => selected.has(i) && a.type === 'create_transaction' && a.accountId === null,
  );
  const accountsQuery = useQuery({
    ...apiQuery(api, 'finance', 'listAccounts', {
      params: { householdId },
      query: { includeArchived: 'false' },
    }),
    enabled: can('finance.read') && proposal.actions.some((a) => a.type === 'create_transaction'),
  });
  const [accountId, setAccountId] = React.useState('');
  const effectiveAccountId = accountId || accountsQuery.data?.[0]?.id || '';

  const apply = useMutation({
    mutationFn: () =>
      api.assistant.apply({
        params: { householdId, proposalId: proposal.id },
        body: {
          actionIndexes: [...selected].sort((a, b) => a - b),
          ...(needsAccount && effectiveAccountId ? { accountId: effectiveAccountId } : {}),
        },
      }),
    onSuccess: async (next) => {
      onChange(next);
      toast.success(t('appliedToast'));
      const modules = new Set(
        next.results.map((r) => MODULE_OF[r.type as AssistantAction['type']]).filter(Boolean),
      );
      await Promise.all([...modules].map((m) => queryClient.invalidateQueries({ queryKey: [m] })));
    },
  });

  const discard = useMutation({
    mutationFn: () => api.assistant.discard({ params: { householdId, proposalId: proposal.id } }),
    onSuccess: (next) => {
      onChange(next);
      toast.success(t('discarded'));
    },
  });

  const toggle = (i: number, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(i);
      else next.delete(i);
      return next;
    });

  const statusBadge =
    proposal.status === 'applied' ? (
      <Badge variant="success">{t('applied')}</Badge>
    ) : proposal.status === 'discarded' ? (
      <Badge variant="secondary">{t('discarded')}</Badge>
    ) : (
      <Badge variant="outline">{t('pending')}</Badge>
    );

  const selectable = proposal.actions.filter((_, i) => !appliedIndexes.has(i)).length;

  return (
    <Card data-testid="assistant-proposal">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>{t('title')}</CardTitle>
        {statusBadge}
      </CardHeader>
      <CardContent className="grid gap-4">
        {proposal.message ? <p className="text-sm">{proposal.message}</p> : null}

        {proposal.actions.length === 0 ? (
          <p className="text-sm text-muted">{t('empty')}</p>
        ) : (
          <ul className="grid gap-2">
            {proposal.actions.map((action, i) => {
              const result = proposal.results.find((r) => r.index === i);
              const Icon = ICONS[action.type];
              const id = `proposal-${proposal.id}-${i}`;
              return (
                <li
                  key={i}
                  className={cn(
                    'flex items-start gap-3 rounded-md border border-border p-3',
                    result && 'border-success/40 bg-success/5',
                  )}
                >
                  {pending && !result ? (
                    <Checkbox
                      id={id}
                      checked={selected.has(i)}
                      onCheckedChange={(v) => toggle(i, v === true)}
                      aria-label={`${t('selectAction')}: ${t(`types.${action.type}`)}`}
                      className="mt-0.5"
                    />
                  ) : result ? (
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                  ) : (
                    <span className="size-5 shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={pending && !result ? id : undefined}
                      className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted uppercase"
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {t(`types.${action.type}`)}
                    </label>
                    <ActionSummary action={action} />
                  </div>
                  {result ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={resultHref(result.type, result.id, action)}>
                        <ExternalLink aria-hidden />
                        {t('open')}
                      </Link>
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {proposal.issues.length > 0 ? (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="mb-1 flex items-center gap-2 font-medium">
              <AlertCircle className="size-4 text-warning" aria-hidden />
              {t('issues')}
            </p>
            <ul className="grid list-disc gap-0.5 pl-6">
              {proposal.issues.map((issue, i) => (
                <li key={i}>{issue.message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {pending && needsAccount && accountsQuery.data && accountsQuery.data.length > 0 ? (
          <Field label={t('account')}>
            {(p) => (
              <NativeSelect
                {...p}
                value={effectiveAccountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accountsQuery.data.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        ) : null}

        {apply.isError ? <AssistantErrorAlert error={apply.error} /> : null}
        {discard.isError ? <AssistantErrorAlert error={discard.error} /> : null}

        {pending ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              loading={discard.isPending}
              disabled={apply.isPending}
              onClick={() => discard.mutate()}
            >
              {t('discard')}
            </Button>
            {selectable > 0 ? (
              <Button
                loading={apply.isPending}
                disabled={selected.size === 0 || discard.isPending}
                onClick={() => apply.mutate()}
              >
                {t('apply', { count: selected.size })}
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ActionSummary({ action }: { action: AssistantAction }) {
  const t = useTranslations('assistant.proposal');
  const fmt = useFormat();
  const { householdId, can, memberById } = useHousehold();
  const calendarsQuery = useQuery({
    ...apiQuery(api, 'calendar', 'listCalendars', { params: { householdId } }),
    enabled: action.type === 'create_event' && can('calendar.read'),
  });
  const listsQuery = useQuery({
    ...apiQuery(api, 'lists', 'list', { params: { householdId } }),
    enabled: action.type === 'add_list_items' && can('lists.read'),
  });
  const names = (ids: string[]) =>
    ids.map((id) => memberById(id)?.displayName ?? t('unknown')).join(', ');
  const line = 'text-sm text-muted';

  switch (action.type) {
    case 'create_event': {
      const calendar = calendarsQuery.data?.find((c) => c.id === action.calendarId);
      return (
        <div className="grid gap-0.5">
          <p className="font-medium">{action.title}</p>
          <p className={line}>
            {action.allDay
              ? `${fmt.date(action.start, { dateStyle: 'full' })} · ${t('allDay')}`
              : `${fmt.dateTime(action.start)} – ${fmt.time(action.end)}`}
            {action.rrule ? ` · ${t('repeats')}` : ''}
          </p>
          {calendar ? <p className={line}>{t('calendar', { name: calendar.name })}</p> : null}
          {action.attendeeMemberIds.length > 0 ? (
            <p className={line}>{t('attendees', { names: names(action.attendeeMemberIds) })}</p>
          ) : null}
          {action.location ? (
            <p className={line}>{t('location', { location: action.location })}</p>
          ) : null}
        </div>
      );
    }
    case 'create_task':
      return (
        <div className="grid gap-0.5">
          <p className="font-medium">{action.title}</p>
          <p className={line}>
            {action.dueAt ? t('due', { date: fmt.dateTime(action.dueAt) }) : t('noDue')}
            {action.recurrence ? ` · ${t('repeats')}` : ''}
            {action.points > 0 ? ` · ${t('points', { points: action.points })}` : ''}
          </p>
          {action.assigneeMemberId ? (
            <p className={line}>
              {t('assignee', {
                name: memberById(action.assigneeMemberId)?.displayName ?? t('unknown'),
              })}
            </p>
          ) : null}
          {action.rotationMemberIds.length > 0 ? (
            <p className={line}>{t('rotation', { names: names(action.rotationMemberIds) })}</p>
          ) : null}
        </div>
      );
    case 'add_list_items': {
      const list = listsQuery.data?.find((l) => l.id === action.listId);
      return (
        <div className="grid gap-0.5">
          <p className="font-medium">{t('list', { name: list?.name ?? t('unknown') })}</p>
          <ul className="flex flex-wrap gap-1">
            {action.items.map((item, i) => (
              <li key={i}>
                <Badge variant="secondary">
                  {item.quantity ? `${item.quantity} ` : ''}
                  {item.text}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case 'create_transaction':
      return (
        <div className="grid gap-0.5">
          <p
            className={cn(
              'font-medium tabular-nums',
              action.amountMinor < 0 ? 'text-danger' : 'text-success',
            )}
          >
            {isCurrencyCode(action.currency)
              ? fmt.money(action.amountMinor, action.currency)
              : `${(action.amountMinor / 100).toFixed(2)} ${action.currency}`}
          </p>
          <p className={line}>
            {fmt.date(action.bookingDate)}
            {action.purpose ? ` · ${action.purpose}` : ''}
          </p>
          {action.counterpartyName ? (
            <p className={line}>{t('counterparty', { name: action.counterpartyName })}</p>
          ) : null}
          {action.accountId === null ? <p className={line}>{t('noAccount')}</p> : null}
        </div>
      );
  }
}
