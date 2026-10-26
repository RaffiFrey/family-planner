'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as React from 'react';
import type { z } from 'zod';
import type { StaffAuditEntry } from '@fp/contracts';
import { columnHelper, DataTable } from '@/components/data-table';
import { CursorPager, useCursorPager } from '@/components/pagination';
import { PageHeader } from '@/components/states';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

type Entry = z.infer<typeof StaffAuditEntry>;
const EMPTY: Entry[] = [];
const h = columnHelper<Entry>();

const columns = h.columns([
  h.accessor('createdAt', {
    header: 'When',
    cell: (c) => (
      <span className="text-xs whitespace-nowrap tabular-nums">{fmtDateTime(c.getValue())}</span>
    ),
  }),
  h.accessor('staffEmail', {
    header: 'Staff',
    cell: (c) => <span className="text-xs">{c.getValue()}</span>,
  }),
  h.accessor('action', {
    header: 'Action',
    cell: (c) => <span className="font-mono text-xs font-medium">{c.getValue()}</span>,
  }),
  h.display({
    id: 'target',
    header: 'Target',
    cell: (c) => (
      <div className="grid">
        <span className="text-xs">{c.row.original.targetType}</span>
        {c.row.original.targetId ? (
          <span className="font-mono text-[11px] text-muted">{c.row.original.targetId}</span>
        ) : null}
      </div>
    ),
  }),
  h.accessor('reason', {
    header: 'Reason',
    cell: (c) => (
      <span className="line-clamp-2 max-w-md text-xs">
        {c.getValue() ?? <span className="text-muted">-</span>}
      </span>
    ),
  }),
]);

export default function AuditPage() {
  const pager = useCursorPager();
  const log = useQuery({
    queryKey: ['audit', pager.cursor],
    queryFn: () => api.audit({ query: { cursor: pager.cursor, limit: 50 } }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Staff audit log"
        description="Every admin action with actor, target and reason. Read-only."
      />
      <Card>
        <DataTable
          columns={columns}
          data={log.data?.items ?? EMPTY}
          isPending={log.isPending}
          error={log.error}
          onRetry={() => void log.refetch()}
          emptyText="No audit entries."
          getRowId={(e) => e.id}
        />
        <CursorPager pager={pager} nextCursor={log.data?.nextCursor} isFetching={log.isFetching} />
      </Card>
    </>
  );
}
