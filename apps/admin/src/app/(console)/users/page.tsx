'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { BanIcon, SearchIcon, UndoIcon } from 'lucide-react';
import * as React from 'react';
import type { z } from 'zod';
import type { AdminUserRow } from '@fp/contracts';
import { columnHelper, DataTable } from '@/components/data-table';
import { CursorPager, useCursorPager, useDebounced } from '@/components/pagination';
import { ReasonDialog } from '@/components/reason-dialog';
import { useCan } from '@/components/staff-context';
import { PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';

type Row = z.infer<typeof AdminUserRow>;
const EMPTY: Row[] = [];
const h = columnHelper<Row>();

export default function UsersPage() {
  const [q, setQ] = React.useState('');
  const query = useDebounced(q.trim());
  const pager = useCursorPager(query);
  const qc = useQueryClient();
  const canBan = useCan('users.ban');
  const [target, setTarget] = React.useState<Row | null>(null);

  const users = useQuery({
    queryKey: ['users', query, pager.cursor],
    queryFn: () => api.users({ query: { q: query || undefined, cursor: pager.cursor, limit: 50 } }),
    placeholderData: keepPreviousData,
  });

  const columns = React.useMemo(
    () =>
      h.columns([
        h.accessor('name', {
          header: 'Name',
          cell: (c) => (
            <div className="grid">
              <span className="font-medium">{c.getValue()}</span>
              <span className="font-mono text-[11px] text-muted">{c.row.original.id}</span>
            </div>
          ),
        }),
        h.accessor('email', {
          header: 'Email',
          cell: (c) => c.getValue() ?? <span className="text-muted">-</span>,
        }),
        h.accessor('households', {
          header: 'Households',
          cell: (c) => <span className="tabular-nums">{c.getValue()}</span>,
        }),
        h.accessor('createdAt', { header: 'Signed up', cell: (c) => fmtDate(c.getValue()) }),
        h.display({
          id: 'status',
          header: 'Status',
          cell: (c) => {
            const u = c.row.original;
            return (
              <div className="flex flex-wrap gap-1">
                {u.banned ? (
                  <Badge variant="danger">Banned</Badge>
                ) : (
                  <Badge variant="success">Active</Badge>
                )}
                {u.deletionScheduledAt ? (
                  <Badge
                    variant="warning"
                    title={`Deletion scheduled ${fmtDateTime(u.deletionScheduledAt)}`}
                  >
                    Deletion {fmtDate(u.deletionScheduledAt)}
                  </Badge>
                ) : null}
              </div>
            );
          },
        }),
        h.display({
          id: 'actions',
          header: () => <span className="sr-only">Actions</span>,
          cell: (c) => {
            const u = c.row.original;
            return (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant={u.banned ? 'outline' : 'ghost'}
                  className={u.banned ? undefined : 'text-danger'}
                  disabled={!canBan}
                  title={canBan ? undefined : 'Requires the support role'}
                  onClick={() => {
                    setTarget(u);
                  }}
                >
                  {u.banned ? <UndoIcon /> : <BanIcon />}
                  {u.banned ? 'Unban' : 'Ban'}
                </Button>
              </div>
            );
          },
        }),
      ]),
    [canBan],
  );

  return (
    <>
      <PageHeader title="Users" description="Search customer accounts by name, email or id." />
      <Card>
        <div className="flex items-center gap-2 border-b border-border p-3">
          <div className="relative w-full max-w-sm">
            <SearchIcon className="pointer-events-none absolute top-2 left-2 size-4 text-muted" />
            <Input
              type="search"
              aria-label="Search users"
              placeholder="Search name, email, id..."
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
          data={users.data?.items ?? EMPTY}
          isPending={users.isPending}
          error={users.error}
          onRetry={() => void users.refetch()}
          emptyText={query ? `No users match "${query}".` : 'No users.'}
          getRowId={(r) => r.id}
        />
        <CursorPager
          pager={pager}
          nextCursor={users.data?.nextCursor}
          isFetching={users.isFetching}
        />
      </Card>

      <ReasonDialog
        open={target !== null}
        onOpenChange={(o) => {
          if (!o) setTarget(null);
        }}
        title={target?.banned ? `Unban ${target.name}?` : `Ban ${target?.name ?? ''}?`}
        description={
          target?.banned
            ? 'The user will be able to sign in again.'
            : 'The user is signed out everywhere and can no longer sign in. Household data is kept.'
        }
        confirmLabel={target?.banned ? 'Unban user' : 'Ban user'}
        destructive={!target?.banned}
        successMessage={target?.banned ? 'User unbanned' : 'User banned'}
        onConfirm={async (reason) => {
          if (!target) return;
          await api.banUser({
            params: { userId: target.id },
            body: { banned: !target.banned, reason },
          });
          await qc.invalidateQueries({ queryKey: ['users'] });
        }}
      />
    </>
  );
}
