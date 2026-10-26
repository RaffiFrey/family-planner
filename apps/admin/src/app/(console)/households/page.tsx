'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SearchIcon } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import type { z } from 'zod';
import type { AdminHouseholdRow } from '@fp/contracts';
import { columnHelper, DataTable } from '@/components/data-table';
import { CursorPager, useCursorPager, useDebounced } from '@/components/pagination';
import { PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { fmtBytes, fmtDate, planLabel } from '@/lib/format';

type Row = z.infer<typeof AdminHouseholdRow>;
const EMPTY: Row[] = [];
const h = columnHelper<Row>();

const columns = h.columns([
  h.accessor('name', {
    header: 'Household',
    cell: (c) => (
      <Link href={`/households/${c.row.original.id}`} className="grid hover:underline">
        <span className="font-medium text-primary">{c.getValue()}</span>
        <span className="font-mono text-[11px] text-muted">{c.row.original.id}</span>
      </Link>
    ),
  }),
  h.accessor('plan', {
    header: 'Plan',
    cell: (c) => (
      <Badge variant={c.getValue() === 'free' ? 'outline' : 'primary'}>
        {planLabel(c.getValue())}
      </Badge>
    ),
  }),
  h.accessor('memberCount', {
    header: 'Members',
    cell: (c) => <span className="tabular-nums">{c.getValue()}</span>,
  }),
  h.accessor('storageBytes', {
    header: 'Storage',
    cell: (c) => <span className="tabular-nums">{fmtBytes(c.getValue())}</span>,
  }),
  h.accessor('locale', { header: 'Locale', cell: (c) => c.getValue().toUpperCase() }),
  h.accessor('timezone', { header: 'Timezone' }),
  h.accessor('createdAt', { header: 'Created', cell: (c) => fmtDate(c.getValue()) }),
]);

export default function HouseholdsPage() {
  const [q, setQ] = React.useState('');
  const query = useDebounced(q.trim());
  const pager = useCursorPager(query);

  const households = useQuery({
    queryKey: ['households', query, pager.cursor],
    queryFn: () =>
      api.households({ query: { q: query || undefined, cursor: pager.cursor, limit: 50 } }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Households"
        description="Support view - no finance or document contents are shown."
      />
      <Card>
        <div className="flex items-center gap-2 border-b border-border p-3">
          <div className="relative w-full max-w-sm">
            <SearchIcon className="pointer-events-none absolute top-2 left-2 size-4 text-muted" />
            <Input
              type="search"
              aria-label="Search households"
              placeholder="Search name or id..."
              className="pl-8"
              value={q}
              maxLength={100}
              onChange={(e) => {
                setQ(e.target.value);
              }}
            />
          </div>
        </div>
        <DataTable
          columns={columns}
          data={households.data?.items ?? EMPTY}
          isPending={households.isPending}
          error={households.error}
          onRetry={() => void households.refetch()}
          emptyText={query ? `No households match "${query}".` : 'No households.'}
          getRowId={(r) => r.id}
        />
        <CursorPager
          pager={pager}
          nextCursor={households.data?.nextCursor}
          isFetching={households.isFetching}
        />
      </Card>
    </>
  );
}
