'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { MemberAvatar } from '@/components/member-avatar';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/use-format';
import { Section } from './section';

export function AuditPage() {
  const t = useTranslations('settings.audit');
  const tu = useTranslations('ui');
  const { householdId, memberById } = useHousehold();
  const fmt = useFormat();

  const query = useInfiniteQuery({
    queryKey: ['households', 'audit', { householdId }],
    queryFn: ({ pageParam }) =>
      api.households.audit({
        params: { householdId },
        query: { limit: 50, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const entries = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Section title={t('title')} description={t('description')}>
      {query.isPending ? (
        <LoadingState rows={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t('when')}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t('who')}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t('what')}
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    {t('entity')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((e) => {
                  const actor = memberById(e.actorMemberId);
                  return (
                    <tr key={e.id}>
                      <td className="py-2 pr-3 whitespace-nowrap text-muted">
                        {fmt.dateTime(e.createdAt)}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-2">
                          {actor ? <MemberAvatar member={actor} size="xs" /> : null}
                          {actor?.displayName ?? t('system')}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{e.action}</td>
                      <td className="py-2 text-muted">
                        {e.entityType}
                        {e.entityId ? (
                          <span className="ml-1 font-mono text-xs">#{e.entityId.slice(0, 8)}</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {query.hasNextPage ? (
            <div className="mt-4 flex justify-center">
              <Button
                variant="secondary"
                loading={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {tu('loadMore')}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Section>
  );
}
