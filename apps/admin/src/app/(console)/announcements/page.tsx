'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import type { Announcement } from '@fp/contracts';
import { columnHelper, DataTable } from '@/components/data-table';
import { ReasonDialog, ReasonField, reasonSchema } from '@/components/reason-dialog';
import { useCan } from '@/components/staff-context';
import { PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { api, errorMessage, withReason } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

type Ann = z.infer<typeof Announcement>;
type Level = Ann['level'];
const EMPTY: Ann[] = [];
const h = columnHelper<Ann>();

const LEVELS: { value: Level; label: string; variant: 'primary' | 'warning' | 'danger' }[] = [
  { value: 'info', label: 'Info', variant: 'primary' },
  { value: 'warning', label: 'Warning', variant: 'warning' },
  { value: 'maintenance', label: 'Maintenance', variant: 'danger' },
];

function status(
  a: Ann,
  now: number,
): { label: string; variant: 'success' | 'outline' | 'default' } {
  const start = new Date(a.startsAt).getTime();
  const end = a.endsAt ? new Date(a.endsAt).getTime() : Infinity;
  if (now < start) return { label: 'Scheduled', variant: 'default' };
  if (now > end) return { label: 'Ended', variant: 'outline' };
  return { label: 'Live', variant: 'success' };
}

/** `<input type="datetime-local">` value (local time) for a Date. */
function toLocalInput(d: Date): string {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

const localDateTime = z
  .string()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Invalid date');
const createSchema = z
  .object({
    title: z.string().trim().min(1, 'Required').max(120),
    body: z.string().trim().min(1, 'Required').max(2000),
    level: z.enum(['info', 'warning', 'maintenance']),
    startsAt: localDateTime,
    endsAt: z.union([z.literal(''), localDateTime]),
    reason: reasonSchema,
  })
  .refine((v) => v.endsAt === '' || new Date(v.endsAt) > new Date(v.startsAt), {
    path: ['endsAt'],
    message: 'Must be after the start',
  });
type CreateValues = z.input<typeof createSchema>;

function CreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const form = useForm<CreateValues>({ resolver: zodResolver(createSchema) });
  const { reset } = form;
  React.useEffect(() => {
    if (open)
      reset({
        title: '',
        body: '',
        level: 'info',
        startsAt: toLocalInput(new Date()),
        endsAt: '',
        reason: '',
      });
  }, [open, reset]);

  const submit = form.handleSubmit(async (v) => {
    try {
      await api.createAnnouncement(
        {
          body: {
            title: v.title,
            body: v.body,
            level: v.level,
            startsAt: new Date(v.startsAt).toISOString(),
            endsAt: v.endsAt ? new Date(v.endsAt).toISOString() : null,
          },
        },
        withReason(v.reason),
      );
      await qc.invalidateQueries({ queryKey: ['announcements'] });
      toast.success('Announcement created');
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  const errors = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>New announcement</DialogTitle>
            <DialogDescription>
              Shown in-app to all users between start and end. Times are in your local time zone.
            </DialogDescription>
          </DialogHeader>
          <Field label="Title" htmlFor="ann-title" error={errors.title?.message}>
            <Input id="ann-title" autoFocus {...form.register('title')} />
          </Field>
          <Field label="Body" htmlFor="ann-body" error={errors.body?.message}>
            <Textarea id="ann-body" rows={4} {...form.register('body')} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Level" htmlFor="ann-level">
              <NativeSelect id="ann-level" {...form.register('level')}>
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Starts" htmlFor="ann-start" error={errors.startsAt?.message}>
              <Input id="ann-start" type="datetime-local" {...form.register('startsAt')} />
            </Field>
            <Field label="Ends (optional)" htmlFor="ann-end" error={errors.endsAt?.message}>
              <Input id="ann-end" type="datetime-local" {...form.register('endsAt')} />
            </Field>
          </div>
          <ReasonField register={form.register} errors={errors} id="ann-reason" />
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
              {form.formState.isSubmitting ? 'Saving...' : 'Publish'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AnnouncementsPage() {
  const qc = useQueryClient();
  const canWrite = useCan('announcements.write');
  const list = useQuery({ queryKey: ['announcements'], queryFn: () => api.announcements() });
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Ann | null>(null);
  const [now] = React.useState(() => Date.now());

  const columns = React.useMemo(
    () =>
      h.columns([
        h.accessor('title', {
          header: 'Announcement',
          cell: (c) => (
            <div className="grid max-w-md">
              <span className="font-medium">{c.getValue()}</span>
              <span className="truncate text-xs text-muted" title={c.row.original.body}>
                {c.row.original.body}
              </span>
            </div>
          ),
        }),
        h.accessor('level', {
          header: 'Level',
          cell: (c) => {
            const l = LEVELS.find((x) => x.value === c.getValue());
            return <Badge variant={l?.variant ?? 'default'}>{l?.label ?? c.getValue()}</Badge>;
          },
        }),
        h.display({
          id: 'status',
          header: 'Status',
          cell: (c) => {
            const s = status(c.row.original, now);
            return <Badge variant={s.variant}>{s.label}</Badge>;
          },
        }),
        h.accessor('startsAt', {
          header: 'Starts',
          cell: (c) => <span className="text-xs">{fmtDateTime(c.getValue())}</span>,
        }),
        h.accessor('endsAt', {
          header: 'Ends',
          cell: (c) => (
            <span className="text-xs">
              {c.getValue() ? fmtDateTime(c.getValue()) : 'open-ended'}
            </span>
          ),
        }),
        h.display({
          id: 'actions',
          header: () => <span className="sr-only">Actions</span>,
          cell: (c) => (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                disabled={!canWrite}
                aria-label={`Delete ${c.row.original.title}`}
                onClick={() => {
                  setDeleting(c.row.original);
                }}
              >
                <Trash2Icon />
              </Button>
            </div>
          ),
        }),
      ]),
    [canWrite, now],
  );

  return (
    <>
      <PageHeader
        title="Announcements"
        description="In-app announcements and maintenance banners."
        actions={
          <Button
            disabled={!canWrite}
            title={canWrite ? undefined : 'Requires the ops role'}
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            <PlusIcon />
            New announcement
          </Button>
        }
      />
      <Card>
        <DataTable
          columns={columns}
          data={list.data ?? EMPTY}
          isPending={list.isPending}
          error={list.error}
          onRetry={() => void list.refetch()}
          emptyText="No announcements."
          getRowId={(a) => a.id}
        />
      </Card>
      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ReasonDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={`Delete "${deleting?.title ?? ''}"?`}
        description="The announcement disappears for all users immediately."
        confirmLabel="Delete"
        destructive
        successMessage="Announcement deleted"
        onConfirm={async (reason) => {
          if (!deleting) return;
          await api.deleteAnnouncement({ params: { id: deleting.id } }, withReason(reason));
          await qc.invalidateQueries({ queryKey: ['announcements'] });
        }}
      />
    </>
  );
}
