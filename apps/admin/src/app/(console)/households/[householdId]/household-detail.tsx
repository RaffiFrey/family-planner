'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, GiftIcon, LockIcon, Undo2Icon } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { type AdminHouseholdDetail, Plan } from '@fp/contracts';
import { columnHelper, DataTable } from '@/components/data-table';
import { ReasonField, reasonSchema } from '@/components/reason-dialog';
import { useCan } from '@/components/staff-context';
import { ErrorState, PageHeader } from '@/components/states';
import { SupportView } from './support-view';
import { RefundDialog } from './refund-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import {
  fmtBytes,
  fmtDate,
  fmtDateTime,
  fmtNumber,
  memberRoleLabel,
  planLabel,
} from '@/lib/format';
import { cn } from '@/lib/utils';

type Detail = z.infer<typeof AdminHouseholdDetail>;
type MemberRow = Detail['members'][number];
const EMPTY: MemberRow[] = [];
const h = columnHelper<MemberRow>();

const memberColumns = h.columns([
  h.accessor('displayName', {
    header: 'Name',
    cell: (c) => <span className="font-medium">{c.getValue()}</span>,
  }),
  h.accessor('role', { header: 'Role', cell: (c) => memberRoleLabel(c.getValue()) }),
  h.accessor('isManaged', {
    header: 'Account',
    cell: (c) =>
      c.getValue() ? <Badge variant="outline">Managed (no login)</Badge> : <Badge>Own login</Badge>,
  }),
  h.accessor('joinedAt', { header: 'Joined', cell: (c) => fmtDate(c.getValue()) }),
]);

const COUNT_LABELS: Record<keyof Detail['counts'], string> = {
  events: 'Events',
  tasks: 'Tasks',
  lists: 'Lists',
  accounts: 'Finance accounts',
  transactions: 'Transactions',
  files: 'Files',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

const compSchema = z.object({
  plan: Plan,
  until: z
    .string()
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Pick a date or leave empty'),
  reason: reasonSchema,
});
type CompValues = z.input<typeof compSchema>;

function CompPlanDialog({
  householdId,
  open,
  onOpenChange,
}: {
  householdId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const form = useForm<CompValues>({
    resolver: zodResolver(compSchema),
    defaultValues: { plan: 'plus', until: '', reason: '' },
  });
  const { reset } = form;
  React.useEffect(() => {
    if (open) reset({ plan: 'plus', until: '', reason: '' });
  }, [open, reset]);

  const submit = form.handleSubmit(async (v) => {
    try {
      // End of the chosen day in the staff member's local time zone.
      const until = v.until ? new Date(`${v.until}T23:59:59`).toISOString() : null;
      await api.compPlan({
        params: { householdId },
        body: { plan: v.plan, until, reason: v.reason.trim() },
      });
      await qc.invalidateQueries({ queryKey: ['household', householdId] });
      await qc.invalidateQueries({ queryKey: ['households'] });
      toast.success('Complimentary plan granted');
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  const today = new Date().toISOString().slice(0, 10);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Grant complimentary plan</DialogTitle>
            <DialogDescription>
              Overrides the billed plan until the given date. Leave the date empty for an open-ended
              comp.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plan" htmlFor="comp-plan" error={form.formState.errors.plan?.message}>
              <NativeSelect id="comp-plan" {...form.register('plan')}>
                {Plan.options.map((p) => (
                  <option key={p} value={p}>
                    {planLabel(p)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              label="Until (optional)"
              htmlFor="comp-until"
              error={form.formState.errors.until?.message}
            >
              <Input id="comp-until" type="date" min={today} {...form.register('until')} />
            </Field>
          </div>
          <ReasonField register={form.register} errors={form.formState.errors} id="comp-reason" />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving...' : 'Grant plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Tab = 'overview' | 'support';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'support', label: 'Support view' },
];

/** Grant end if it is still in the future, else null (the API filters too; this covers drift). */
function activeGrantUntil(until: string | null): string | null {
  if (!until) return null;
  const t = new Date(until).getTime();
  return Number.isNaN(t) || t <= Date.now() ? null : until;
}

function SupportAccessStatus({ until }: { until: string | null }) {
  const active = activeGrantUntil(until);
  return (
    <span data-testid="support-access-status" className="flex items-center justify-end gap-2">
      {active ? (
        <>
          <Badge variant="success">Granted</Badge>
          <span className="text-xs tabular-nums" title={fmtDateTime(active)}>
            until {fmtDateTime(active)}
          </span>
        </>
      ) : (
        <Badge variant="outline">Not granted</Badge>
      )}
    </span>
  );
}

export function HouseholdDetail({ householdId }: { householdId: string }) {
  const canComp = useCan('households.comp');
  const canRefund = useCan('households.refund');
  const [compOpen, setCompOpen] = React.useState(false);
  const [refundOpen, setRefundOpen] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>('overview');
  const detail = useQuery({
    queryKey: ['household', householdId],
    queryFn: () => api.household({ params: { householdId } }),
  });

  const back = (
    <Button asChild variant="ghost" size="sm">
      <Link href="/households">
        <ArrowLeftIcon />
        Households
      </Link>
    </Button>
  );

  if (detail.isPending) {
    return (
      <div className="grid gap-4">
        {back}
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }
  if (detail.isError) {
    return (
      <div className="grid gap-4">
        {back}
        <Card>
          <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
        </Card>
      </div>
    );
  }

  const { household, members, counts, subscription, supportAccessUntil } = detail.data;
  const grantUntil = activeGrantUntil(supportAccessUntil);
  return (
    <div className="grid gap-4">
      <div>{back}</div>
      <PageHeader
        title={household.name}
        description={household.id}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setRefundOpen(true);
              }}
              disabled={!canRefund}
              title={canRefund ? undefined : 'Requires the billing role'}
            >
              <Undo2Icon />
              Refund
            </Button>
            <Button
              onClick={() => {
                setCompOpen(true);
              }}
              disabled={!canComp}
              title={canComp ? undefined : 'Requires the billing role'}
            >
              <GiftIcon />
              Comp plan
            </Button>
          </>
        }
      />

      <div
        className="flex flex-wrap items-center gap-1 border-b border-border"
        role="tablist"
        aria-label="Household sections"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => {
              setTab(t.id);
            }}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted hover:text-foreground',
              tab === t.id && 'border-primary text-foreground',
            )}
          >
            {t.label}
            {t.id === 'support' ? (
              <span
                className={cn('size-1.5 rounded-full', grantUntil ? 'bg-success' : 'bg-border')}
                aria-hidden
              />
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'support' ? (
        <div role="tabpanel" id="panel-support" aria-labelledby="tab-support">
          <SupportView householdId={householdId} grantUntil={grantUntil} />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="panel-overview"
          aria-labelledby="tab-overview"
          className="grid gap-4"
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Household</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <dl className="divide-y divide-border">
                  <Row label="Plan">
                    <Badge variant={household.plan === 'free' ? 'outline' : 'primary'}>
                      {planLabel(household.plan)}
                    </Badge>
                  </Row>
                  <Row label="Members">{household.memberCount}</Row>
                  <Row label="Storage">{fmtBytes(household.storageBytes)}</Row>
                  <Row label="Locale">{household.locale.toUpperCase()}</Row>
                  <Row label="Currency">{household.currency}</Row>
                  <Row label="Timezone">{household.timezone}</Row>
                  <Row label="Created">{fmtDateTime(household.createdAt)}</Row>
                  <Row label="Support access">
                    <SupportAccessStatus until={supportAccessUntil} />
                  </Row>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Subscription</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <dl className="divide-y divide-border">
                  <Row label="Plan">{planLabel(subscription.plan)}</Row>
                  <Row label="Status">
                    <Badge
                      variant={
                        subscription.status === 'active'
                          ? 'success'
                          : subscription.status === 'past_due'
                            ? 'warning'
                            : 'default'
                      }
                    >
                      {subscription.status}
                    </Badge>
                  </Row>
                  <Row label="Provider">{subscription.provider ?? '-'}</Row>
                  <Row label="Comp until">
                    {subscription.compUntil ? (
                      fmtDateTime(subscription.compUntil)
                    ) : (
                      <span className="text-muted">no comp</span>
                    )}
                  </Row>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Content counts</CardTitle>
                <span
                  className="flex items-center gap-1 text-[11px] text-muted"
                  title="Privacy by design (ADR-0008)"
                >
                  <LockIcon className="size-3" />
                  contents hidden
                </span>
              </CardHeader>
              <CardContent className="py-2">
                <dl className="divide-y divide-border">
                  {(Object.keys(COUNT_LABELS) as (keyof Detail['counts'])[]).map((k) => (
                    <Row key={k} label={COUNT_LABELS[k]}>
                      <span className="tabular-nums">{fmtNumber(counts[k])}</span>
                    </Row>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
            </CardHeader>
            <DataTable
              columns={memberColumns}
              data={members.length ? members : EMPTY}
              emptyText="No members."
              getRowId={(m) => m.id}
            />
          </Card>

          <p className="text-xs text-muted">
            Finance, document and vault contents are intentionally not available in the admin
            console. Support access to customer data requires the customer&apos;s time-boxed
            consent.
          </p>
        </div>
      )}

      <CompPlanDialog householdId={householdId} open={compOpen} onOpenChange={setCompOpen} />
      <RefundDialog householdId={householdId} open={refundOpen} onOpenChange={setRefundOpen} />
    </div>
  );
}
