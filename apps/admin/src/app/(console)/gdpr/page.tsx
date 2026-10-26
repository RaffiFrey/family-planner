'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcwIcon } from 'lucide-react';
import * as React from 'react';
import type { z } from 'zod';
import type { GdprRequest } from '@fp/contracts';
import { columnHelper, DataTable } from '@/components/data-table';
import { CursorPager, useCursorPager } from '@/components/pagination';
import { ReasonDialog } from '@/components/reason-dialog';
import { useCan } from '@/components/staff-context';
import { PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

type Req = z.infer<typeof GdprRequest>;
type Status = Req['status'];
const EMPTY: Req[] = [];
const h = columnHelper<Req>();

const STATUS: Record<
  Status,
  { label: string; variant: 'default' | 'primary' | 'success' | 'danger' }
> = {
  pending: { label: 'Pending', variant: 'default' },
  processing: { label: 'Processing', variant: 'primary' },
  done: { label: 'Done', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
};
const FILTERS: (Status | 'all')[] = ['all', 'pending', 'processing', 'failed', 'done'];

export default function GdprPage() {
  const qc = useQueryClient();
  const canRetry = useCan('gdpr.retry');
  const [filter, setFilter] = React.useState<Status | 'all'>('all');
  const pager = useCursorPager(filter);
  const [retrying, setRetrying] = React.useState<Req | null>(null);

  const list = useQuery({
    queryKey: ['gdpr', filter, pager.cursor],
    queryFn: () =>
      api.gdprRequests({
        query: { status: filter === 'all' ? undefined : filter, cursor: pager.cursor, limit: 50 },
      }),
    placeholderData: keepPreviousData,
  });

  const columns = React.useMemo(
    () =>
      h.columns([
        h.accessor('type', {
          header: 'Type',
          cell: (c) => (
            <Badge variant={c.getValue() === 'deletion' ? 'warning' : 'outline'}>
              {c.getValue() === 'deletion' ? 'Deletion' : 'Export'}
            </Badge>
          ),
        }),
        h.accessor('userEmail', {
          header: 'User',
          cell: (c) => (
            <div className="grid">
              <span>{c.getValue() ?? <span className="text-muted">(deleted)</span>}</span>
              <span className="font-mono text-[11px] text-muted">{c.row.original.userId}</span>
            </div>
          ),
        }),
        h.accessor('status', {
          header: 'Status',
          cell: (c) => (
            <Badge variant={STATUS[c.getValue()].variant}>{STATUS[c.getValue()].label}</Badge>
          ),
        }),
        h.accessor('requestedAt', {
          header: 'Requested',
          cell: (c) => <span className="text-xs">{fmtDateTime(c.getValue())}</span>,
        }),
        h.accessor('completedAt', {
          header: 'Completed',
          cell: (c) => <span className="text-xs">{fmtDateTime(c.getValue())}</span>,
        }),
        h.display({
          id: 'actions',
          header: () => <span className="sr-only">Actions</span>,
          cell: (c) =>
            c.row.original.status === 'failed' ? (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canRetry}
                  title={canRetry ? undefined : 'Requires the support role'}
                  onClick={() => {
                    setRetrying(c.row.original);
                  }}
                >
                  <RotateCcwIcon />
                  Retry
                </Button>
              </div>
            ) : null,
        }),
      ]),
    [canRetry],
  );

  return (
    <>
      <PageHeader
        title="GDPR queue"
        description="Data export (Art. 15/20) and erasure (Art. 17) requests."
      />
      <Card>
        <div
          className="flex flex-wrap items-center gap-1 border-b border-border p-2"
          role="tablist"
          aria-label="Filter by status"
        >
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => {
                setFilter(f);
              }}
              className={cn(
                'rounded-sm px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-muted hover:text-foreground',
                filter === f && 'bg-surface-muted text-foreground',
              )}
            >
              {f === 'all' ? 'All' : STATUS[f].label}
            </button>
          ))}
        </div>
        <DataTable
          columns={columns}
          data={list.data?.items ?? EMPTY}
          isPending={list.isPending}
          error={list.error}
          onRetry={() => void list.refetch()}
          emptyText="No requests in this state."
          getRowId={(r) => r.id}
        />
        <CursorPager
          pager={pager}
          nextCursor={list.data?.nextCursor}
          isFetching={list.isFetching}
        />
      </Card>
      <ReasonDialog
        open={retrying !== null}
        onOpenChange={(o) => {
          if (!o) setRetrying(null);
        }}
        title="Retry GDPR request?"
        description={
          retrying
            ? `Re-queues the failed ${retrying.type} request for ${retrying.userEmail ?? retrying.userId}.`
            : undefined
        }
        confirmLabel="Retry"
        successMessage="Request re-queued"
        onConfirm={async (reason) => {
          if (!retrying) return;
          await api.retryGdpr({ params: { id: retrying.id }, body: { reason } });
          await qc.invalidateQueries({ queryKey: ['gdpr'] });
        }}
      />
    </>
  );
}
