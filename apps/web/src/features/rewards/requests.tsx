'use client';

import { apiQuery } from '@fp/api-client';
import type { Redemption } from '@fp/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, History, Inbox, Undo2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { toast } from 'sonner';
import { MemberAvatar } from '@/components/member-avatar';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';
import { useEarners, useIsRewardsAdult } from './hooks';

type Status = Redemption['status'];
const STATUS_VARIANT: Record<Status, 'warning' | 'success' | 'danger' | 'secondary'> = {
  requested: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'secondary',
};

export function RewardRequests() {
  const t = useTranslations('rewards.requests');
  const fmt = useFormat();
  const { householdId, member, memberById } = useHousehold();
  const adult = useIsRewardsAdult();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const [status, setStatus] = React.useState<Status | ''>('requested');
  const listQuery = apiQuery(api, 'rewards', 'redemptions', {
    params: { householdId },
    query: status ? { status } : {},
  });
  const query = useQuery(listQuery);

  const decide = useMutation({
    mutationFn: ({ r, action }: { r: Redemption; action: 'approve' | 'reject' | 'cancel' }) => {
      const params = { householdId, redemptionId: r.id };
      if (action === 'approve') return api.rewards.approveRedemption({ params, body: {} });
      if (action === 'reject') return api.rewards.rejectRedemption({ params, body: {} });
      return api.rewards.cancelRedemption({ params });
    },
    onMutate: async ({ r, action }) => {
      // Optimistically update the status (and drop it from a filtered "open" view).
      await queryClient.cancelQueries({ queryKey: listQuery.queryKey });
      const previous = queryClient.getQueryData<Redemption[]>(listQuery.queryKey);
      const next: Status =
        action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled';
      queryClient.setQueryData<Redemption[]>(listQuery.queryKey, (list) =>
        (list ?? [])
          .map((x) => (x.id === r.id ? { ...x, status: next } : x))
          .filter((x) => !status || x.status === status),
      );
      return { previous };
    },
    onSuccess: (_r, { action }) =>
      toast.success(
        t(action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled'),
      ),
    onError: (err, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listQuery.queryKey, ctx.previous);
      toastError(err);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['rewards'] }),
  });

  return (
    <div className="grid gap-4">
      <Field label={t('filter')} className="w-48">
        {(p) => (
          <NativeSelect
            {...p}
            value={status}
            onChange={(e) => setStatus(e.target.value as Status | '')}
          >
            <option value="">{t('all')}</option>
            {(['requested', 'approved', 'rejected', 'cancelled'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      {query.isPending ? (
        <LoadingState rows={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState icon={<Inbox />} title={t('empty')} />
      ) : (
        <ul className="grid gap-2">
          {query.data.map((r) => {
            const m = memberById(r.memberId);
            const decider = memberById(r.decidedByMemberId);
            const open = r.status === 'requested';
            return (
              <li key={r.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center gap-3 pt-4">
                    {m ? <MemberAvatar member={m} size="md" /> : null}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {r.rewardTitle}{' '}
                        <span className="text-sm font-normal text-muted tabular-nums">
                          · {fmt.number(r.costPoints)}
                        </span>
                      </p>
                      <p className="text-xs text-muted">
                        {m?.displayName ?? '?'} ·{' '}
                        {t('requestedAt', { date: fmt.dateTime(r.createdAt) })}
                      </p>
                      {r.note ? <p className="mt-1 text-sm italic">{r.note}</p> : null}
                      {r.decidedAt && decider ? (
                        <p className="text-xs text-muted">
                          {t('decidedBy', {
                            status: t(`status.${r.status}`),
                            name: decider.displayName,
                            date: fmt.date(r.decidedAt),
                          })}
                        </p>
                      ) : null}
                    </div>
                    <Badge variant={STATUS_VARIANT[r.status]}>{t(`status.${r.status}`)}</Badge>
                    {open ? (
                      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                        {adult ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => decide.mutate({ r, action: 'approve' })}
                            >
                              <Check aria-hidden />
                              {t('approve')}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => decide.mutate({ r, action: 'reject' })}
                            >
                              <X aria-hidden />
                              {t('reject')}
                            </Button>
                          </>
                        ) : null}
                        {r.memberId === member.id && !adult ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => decide.mutate({ r, action: 'cancel' })}
                          >
                            <Undo2 aria-hidden />
                            {t('cancel')}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function PointsHistory() {
  const t = useTranslations('rewards.history');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId, memberById } = useHousehold();
  const earners = useEarners();
  const [memberId, setMemberId] = React.useState('');

  const query = useInfiniteQuery({
    queryKey: ['rewards', 'points', { householdId, memberId }],
    queryFn: ({ pageParam }) =>
      api.rewards.points({
        params: { householdId },
        query: { cursor: pageParam, limit: 50, ...(memberId ? { memberId } : {}) },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="grid gap-4">
      <Field label={t('member')} className="w-56">
        {(p) => (
          <NativeSelect {...p} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">{t('allMembers')}</option>
            {earners.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      {query.isPending ? (
        <LoadingState rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<History />} title={t('empty')} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {rows.map((e) => {
            const m = memberById(e.memberId);
            return (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
                {m ? <MemberAvatar member={m} size="sm" /> : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{e.reason}</p>
                  <p className="text-xs text-muted">
                    {m?.displayName ?? '?'} · {fmt.dateTime(e.createdAt)}
                    {e.taskId ? ` · ${t('task')}` : e.rewardId ? ` · ${t('reward')}` : ''}
                  </p>
                </div>
                <span
                  className={cn(
                    'font-semibold tabular-nums',
                    e.delta > 0 ? 'text-success' : 'text-danger',
                  )}
                >
                  {e.delta > 0 ? '+' : ''}
                  {fmt.number(e.delta)}
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
    </div>
  );
}
