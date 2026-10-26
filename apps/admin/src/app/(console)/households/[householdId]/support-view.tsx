'use client';

import { useQuery } from '@tanstack/react-query';
import { ShieldAlertIcon, ShieldCheckIcon, ShieldOffIcon } from 'lucide-react';
import * as React from 'react';
import { ApiError } from '@fp/contracts';
import { columnHelper, DataTable } from '@/components/data-table';
import { useCan } from '@/components/staff-context';
import { ErrorState, MissingRoleState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/table';
import { api, isMissingRole } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtNumber, memberRoleLabel } from '@/lib/format';

type Support = Awaited<ReturnType<typeof api.supportView>>;
type MemberRow = Support['members'][number];
type ActivityRow = Support['recentActivity'][number];
const EMPTY_MEMBERS: MemberRow[] = [];
const EMPTY_ACTIVITY: ActivityRow[] = [];
const m = columnHelper<MemberRow>();
const a = columnHelper<ActivityRow>();

const memberColumns = m.columns([
  m.accessor('displayName', {
    header: 'Name',
    cell: (c) => (
      <span className="flex items-center gap-2 font-medium">
        <span
          className="size-2.5 shrink-0 rounded-full border border-border"
          style={{ backgroundColor: c.row.original.color }}
          aria-hidden
        />
        {c.getValue()}
      </span>
    ),
  }),
  m.accessor('role', { header: 'Role', cell: (c) => memberRoleLabel(c.getValue()) }),
  m.accessor('hasLogin', {
    header: 'Login',
    cell: (c) =>
      c.getValue() ? (
        <Badge variant="success">Has login</Badge>
      ) : (
        <Badge variant="outline">{c.row.original.isManaged ? 'Managed' : 'No login'}</Badge>
      ),
  }),
  m.accessor('pushDevices', {
    header: 'Push devices',
    cell: (c) => <span className="tabular-nums">{fmtNumber(c.getValue())}</span>,
  }),
  m.accessor('accessUntil', {
    header: 'Member access until',
    cell: (c) => (c.getValue() ? fmtDate(c.getValue()) : <span className="text-muted">-</span>),
  }),
  m.accessor('joinedAt', { header: 'Joined', cell: (c) => fmtDate(c.getValue()) }),
]);

const activityColumns = a.columns([
  a.accessor('createdAt', {
    header: 'When',
    cell: (c) => (
      <span className="text-xs whitespace-nowrap tabular-nums">{fmtDateTime(c.getValue())}</span>
    ),
  }),
  a.accessor('action', {
    header: 'Action',
    cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
  }),
  a.accessor('entityType', {
    header: 'Entity',
    cell: (c) => <Badge variant="outline">{c.getValue()}</Badge>,
  }),
]);

function ConsentNote() {
  return (
    <p
      className="flex items-start gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-muted"
      data-testid="support-consent-note"
    >
      <ShieldAlertIcon className="mt-px size-4 shrink-0 text-warning" />
      <span>
        This view is only available while the customer has granted support access from within the
        app. Access is time-boxed by the customer and every opening is recorded in the staff audit
        log together with the customer&apos;s stated reason. Finance, document and vault contents
        remain hidden.
      </span>
    </p>
  );
}

function NotGranted({ detail }: { detail?: string | undefined }) {
  return (
    <Card data-testid="support-not-granted">
      <div role="status" className="flex flex-col items-center gap-2 py-10 text-center">
        <ShieldOffIcon className="size-5 text-muted" />
        <p className="text-sm font-medium">Support access not granted</p>
        <p className="max-w-md text-xs text-muted">
          {detail ??
            'The customer has not granted support access (or it has expired). Ask them to enable it in the app under household settings; it cannot be activated from the admin console.'}
        </p>
      </div>
    </Card>
  );
}

function Stat({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-xs text-muted">{label}</p>
        <p
          className={
            alert && value > 0
              ? 'text-xl font-semibold text-danger tabular-nums'
              : 'text-xl font-semibold tabular-nums'
          }
        >
          {fmtNumber(value)}
        </p>
      </CardContent>
    </Card>
  );
}

export function SupportView({
  householdId,
  grantUntil,
}: {
  householdId: string;
  /** Active grant end from the household detail; null when not granted / expired. */
  grantUntil: string | null;
}) {
  const canView = useCan('households.supportView');
  const enabled = canView && grantUntil !== null;
  const view = useQuery({
    queryKey: ['household', householdId, 'support'],
    queryFn: () => api.supportView({ params: { householdId } }),
    enabled,
    // Every load is audited server-side: do not refetch silently.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });

  let body: React.ReactNode;
  if (!canView) {
    body = (
      <Card>
        <MissingRoleState role="support" />
      </Card>
    );
  } else if (grantUntil === null) {
    body = <NotGranted />;
  } else if (view.isPending) {
    body = (
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  } else if (view.isError) {
    const err = view.error;
    body =
      err instanceof ApiError && err.status === 403 && !isMissingRole(err) ? (
        <NotGranted detail={err.message} />
      ) : (
        <Card>
          <ErrorState error={err} onRetry={() => void view.refetch()} />
        </Card>
      );
  } else {
    const d = view.data;
    body = (
      <div className="grid gap-4" data-testid="support-view">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-muted">Access granted until</p>
              <p className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
                <ShieldCheckIcon className="size-4 text-success" />
                {fmtDateTime(d.accessUntil)}
              </p>
            </CardContent>
          </Card>
          <Stat label="Pending invitations" value={d.pendingInvitations} />
          <Stat label="Failed uploads" value={d.failedUploads} alert />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <span className="text-xs text-muted">{d.members.length}</span>
          </CardHeader>
          <DataTable
            columns={memberColumns}
            data={d.members.length ? d.members : EMPTY_MEMBERS}
            emptyText="No members."
            getRowId={(r) => r.id}
          />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <span className="text-xs text-muted">action names only, no payloads</span>
          </CardHeader>
          <DataTable
            columns={activityColumns}
            data={d.recentActivity.length ? d.recentActivity : EMPTY_ACTIVITY}
            emptyText="No recent activity."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <ConsentNote />
      {body}
    </div>
  );
}
