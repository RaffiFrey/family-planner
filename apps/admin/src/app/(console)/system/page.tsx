'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLinkIcon, RefreshCwIcon } from 'lucide-react';
import { columnHelper, DataTable } from '@/components/data-table';
import { useCan } from '@/components/staff-context';
import { ErrorState, MissingRoleState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/table';
import { api } from '@/lib/api';
import { fmtDateTime, fmtNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

const REFRESH_MS = 15_000;

type Status = Awaited<ReturnType<typeof api.system>>;
type QueueRow = Status['queues'][number];
const EMPTY: QueueRow[] = [];
const h = columnHelper<QueueRow>();

const CHECK_LABELS: Record<string, string> = { database: 'Database', redis: 'Redis' };
const QUEUE_LABELS: Record<string, string> = {
  events: 'Events',
  files: 'Files',
  maintenance: 'Maintenance',
};
const LINK_LABELS: Record<string, string> = {
  sentry: 'Sentry',
  grafana: 'Grafana',
  apiDocs: 'API docs',
};
/** Outbox rows not yet relayed; a growing backlog means the relay worker is stuck. */
const OUTBOX_WARN = 100;
const OUTBOX_DANGER = 1000;

function Count({ value, alert }: { value: number; alert?: 'warning' | 'danger' | undefined }) {
  return (
    <span
      className={cn(
        'tabular-nums',
        value > 0 && alert === 'warning' && 'font-medium text-warning',
        value > 0 && alert === 'danger' && 'font-medium text-danger',
      )}
    >
      {fmtNumber(value)}
    </span>
  );
}

const columns = h.columns([
  h.accessor('name', {
    header: 'Queue',
    cell: (c) => (
      <span className="flex items-center gap-2">
        <span className="font-medium">{QUEUE_LABELS[c.getValue()] ?? c.getValue()}</span>
        <span className="font-mono text-[11px] text-muted">{c.getValue()}</span>
      </span>
    ),
  }),
  h.accessor('waiting', { header: 'Waiting', cell: (c) => <Count value={c.getValue()} /> }),
  h.accessor('active', { header: 'Active', cell: (c) => <Count value={c.getValue()} /> }),
  h.accessor('delayed', { header: 'Delayed', cell: (c) => <Count value={c.getValue()} /> }),
  h.accessor('failed', {
    header: 'Failed',
    cell: (c) => <Count value={c.getValue()} alert="danger" />,
  }),
]);

export default function SystemPage() {
  const canView = useCan('system.view');
  const status = useQuery({
    queryKey: ['system'],
    queryFn: () => api.system(),
    enabled: canView,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  });

  if (!canView) {
    return (
      <>
        <PageHeader title="System" />
        <Card>
          <MissingRoleState role="ops" />
        </Card>
      </>
    );
  }

  const data = status.data;
  const allUp = data ? Object.values(data.checks).every((v) => v === 'up') : undefined;
  const backlog = data?.outboxBacklog ?? 0;
  const backlogVariant =
    backlog >= OUTBOX_DANGER ? 'danger' : backlog >= OUTBOX_WARN ? 'warning' : 'success';

  return (
    <>
      <PageHeader
        title="System"
        description={`Health checks, background queues and monitoring. Refreshes every ${REFRESH_MS / 1000} s.`}
        actions={
          <>
            {status.dataUpdatedAt ? (
              <span className="text-xs text-muted" data-testid="system-updated">
                Updated {fmtDateTime(new Date(status.dataUpdatedAt).toISOString())}
              </span>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void status.refetch()}
              disabled={status.isFetching}
            >
              <RefreshCwIcon className={cn(status.isFetching && 'animate-spin')} />
              Refresh
            </Button>
          </>
        }
      />

      {status.isError && !data ? (
        <Card>
          <ErrorState error={status.error} onRetry={() => void status.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-4">
          {status.isError ? (
            <p role="status" className="text-xs text-danger">
              Last refresh failed; showing the previous result.
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-3">
            <Card data-testid="system-checks">
              <CardHeader>
                <CardTitle>Health checks</CardTitle>
                {allUp === undefined ? null : (
                  <Badge variant={allUp ? 'success' : 'danger'}>
                    {allUp ? 'All systems up' : 'Degraded'}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="py-2">
                {data ? (
                  <dl className="divide-y divide-border">
                    {Object.entries(data.checks).map(([name, state]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between py-1.5 text-sm"
                        data-testid={`check-${name}`}
                      >
                        <dt className="text-muted">{CHECK_LABELS[name] ?? name}</dt>
                        <dd>
                          <Badge variant={state === 'up' ? 'success' : 'danger'}>
                            {state === 'up' ? 'Up' : 'Down'}
                          </Badge>
                        </dd>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-1.5 text-sm">
                      <dt className="text-muted">API version</dt>
                      <dd className="font-mono text-xs">{data.version}</dd>
                    </div>
                  </dl>
                ) : (
                  <div className="grid gap-2 py-2">
                    <Skeleton className="h-5" />
                    <Skeleton className="h-5" />
                    <Skeleton className="h-5" />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="outbox-backlog">
              <CardHeader>
                <CardTitle>Outbox backlog</CardTitle>
                {data ? (
                  <Badge variant={backlogVariant}>
                    {backlogVariant === 'success'
                      ? 'OK'
                      : backlogVariant === 'warning'
                        ? 'Elevated'
                        : 'Stuck?'}
                  </Badge>
                ) : null}
              </CardHeader>
              <CardContent>
                {data ? (
                  <>
                    <p className="text-2xl font-semibold tabular-nums">{fmtNumber(backlog)}</p>
                    <p className="text-xs text-muted">
                      Domain events not yet relayed to the queues.
                    </p>
                  </>
                ) : (
                  <Skeleton className="h-10" />
                )}
              </CardContent>
            </Card>

            <Card data-testid="system-links">
              <CardHeader>
                <CardTitle>Monitoring</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                {data ? (
                  Object.keys(data.links).length ? (
                    <ul className="grid gap-1">
                      {Object.entries(data.links).map(([key, href]) => (
                        <li key={key}>
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 rounded-sm py-1 text-sm text-primary hover:underline"
                          >
                            <ExternalLinkIcon className="size-3.5" />
                            {LINK_LABELS[key] ?? key}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-2 text-xs text-muted">No monitoring links configured.</p>
                  )
                ) : (
                  <div className="grid gap-2 py-2">
                    <Skeleton className="h-5" />
                    <Skeleton className="h-5" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card data-testid="system-queues">
            <CardHeader>
              <CardTitle>Queues (BullMQ)</CardTitle>
            </CardHeader>
            <DataTable
              columns={columns}
              data={data?.queues ?? EMPTY}
              isPending={status.isPending}
              emptyText="No queues reported."
              getRowId={(q) => q.name}
              skeletonRows={3}
            />
          </Card>
        </div>
      )}
    </>
  );
}
