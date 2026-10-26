'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilIcon, PlusIcon } from 'lucide-react';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import type { FeatureFlag } from '@fp/contracts';
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
import { Input, Textarea } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage, withReason } from '@/lib/api';
import { fmtRelative } from '@/lib/format';

type Flag = z.infer<typeof FeatureFlag>;
const EMPTY: Flag[] = [];
const h = columnHelper<Flag>();

const uuid = z.uuid();
function parseIds(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

const flagSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Required')
    .max(100)
    .regex(/^[a-z0-9_.-]+$/, 'Lowercase letters, digits, "_", "." and "-" only'),
  description: z.string().trim().max(300),
  enabled: z.boolean(),
  rolloutPercent: z.coerce.number<string | number>().int('Whole number').min(0).max(100),
  allowlist: z
    .string()
    .refine(
      (t) => parseIds(t).every((id) => uuid.safeParse(id).success),
      'Every entry must be a household UUID',
    ),
  reason: reasonSchema,
});
type FlagValues = z.input<typeof flagSchema>;

function FlagDialog({
  flag,
  open,
  onOpenChange,
}: {
  flag: Flag | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const isNew = flag === null;
  const form = useForm<FlagValues, unknown, z.output<typeof flagSchema>>({
    resolver: zodResolver(flagSchema),
  });
  const { reset } = form;

  React.useEffect(() => {
    if (!open) return;
    reset({
      key: flag?.key ?? '',
      description: flag?.description ?? '',
      enabled: flag?.enabled ?? false,
      rolloutPercent: flag?.rolloutPercent ?? 0,
      allowlist: flag?.householdAllowlist.join('\n') ?? '',
      reason: '',
    });
  }, [open, flag, reset]);

  const submit = form.handleSubmit(async (v) => {
    try {
      await api.upsertFlag(
        {
          params: { key: v.key },
          body: {
            description: v.description,
            enabled: v.enabled,
            rolloutPercent: v.rolloutPercent,
            householdAllowlist: parseIds(v.allowlist),
          },
        },
        withReason(v.reason),
      );
      await qc.invalidateQueries({ queryKey: ['flags'] });
      toast.success(isNew ? `Flag "${v.key}" created` : `Flag "${v.key}" updated`);
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
            <DialogTitle>{isNew ? 'New feature flag' : `Edit ${flag.key}`}</DialogTitle>
            <DialogDescription>
              Rollout is stable per household. Allowlisted households always get the feature while
              the flag is enabled.
            </DialogDescription>
          </DialogHeader>
          {isNew ? (
            <Field label="Key" htmlFor="flag-key" error={errors.key?.message}>
              <Input
                id="flag-key"
                placeholder="finance.csv_import_v2"
                className="font-mono"
                autoFocus
                {...form.register('key')}
              />
            </Field>
          ) : null}
          <Field label="Description" htmlFor="flag-desc" error={errors.description?.message}>
            <Input id="flag-desc" maxLength={300} {...form.register('description')} />
          </Field>
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="flex items-center gap-2 pb-1.5">
              <Controller
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <Switch
                    id="flag-enabled"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="flag-enabled">Enabled</Label>
            </div>
            <Field label="Rollout %" htmlFor="flag-rollout" error={errors.rolloutPercent?.message}>
              <Input
                id="flag-rollout"
                type="number"
                min={0}
                max={100}
                step={1}
                {...form.register('rolloutPercent')}
              />
            </Field>
          </div>
          <Field
            label="Household allowlist"
            htmlFor="flag-allow"
            error={errors.allowlist?.message}
            hint="Household UUIDs, one per line or comma-separated."
          >
            <Textarea
              id="flag-allow"
              rows={3}
              className="font-mono text-xs"
              {...form.register('allowlist')}
            />
          </Field>
          <ReasonField register={form.register} errors={errors} id="flag-reason" />
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
              {form.formState.isSubmitting ? 'Saving...' : isNew ? 'Create flag' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function FlagsPage() {
  const qc = useQueryClient();
  const canWrite = useCan('flags.write');
  const flags = useQuery({ queryKey: ['flags'], queryFn: () => api.flags() });
  const [editing, setEditing] = React.useState<{ flag: Flag | null } | null>(null);
  const [toggling, setToggling] = React.useState<Flag | null>(null);

  const columns = React.useMemo(
    () =>
      h.columns([
        h.accessor('key', {
          header: 'Key',
          cell: (c) => (
            <div className="grid">
              <span className="font-mono text-xs font-medium">{c.getValue()}</span>
              <span className="text-xs text-muted">{c.row.original.description}</span>
            </div>
          ),
        }),
        h.accessor('enabled', {
          header: 'Enabled',
          cell: (c) => (
            <Switch
              checked={c.getValue()}
              disabled={!canWrite}
              aria-label={`Toggle ${c.row.original.key}`}
              onCheckedChange={() => {
                setToggling(c.row.original);
              }}
            />
          ),
        }),
        h.accessor('rolloutPercent', {
          header: 'Rollout',
          cell: (c) => (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${c.getValue()}%` }}
                />
              </div>
              <span className="text-xs tabular-nums">{c.getValue()} %</span>
            </div>
          ),
        }),
        h.accessor('householdAllowlist', {
          header: 'Allowlist',
          cell: (c) =>
            c.getValue().length ? (
              <Badge variant="outline" title={c.getValue().join('\n')}>
                {c.getValue().length} households
              </Badge>
            ) : (
              <span className="text-muted">-</span>
            ),
        }),
        h.accessor('updatedAt', {
          header: 'Updated',
          cell: (c) => <span className="text-xs text-muted">{fmtRelative(c.getValue())}</span>,
        }),
        h.display({
          id: 'actions',
          header: () => <span className="sr-only">Actions</span>,
          cell: (c) => (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                disabled={!canWrite}
                onClick={() => {
                  setEditing({ flag: c.row.original });
                }}
              >
                <PencilIcon />
                Edit
              </Button>
            </div>
          ),
        }),
      ]),
    [canWrite],
  );

  return (
    <>
      <PageHeader
        title="Feature flags"
        description="Staged rollouts per household."
        actions={
          <Button
            disabled={!canWrite}
            title={canWrite ? undefined : 'Requires the ops role'}
            onClick={() => {
              setEditing({ flag: null });
            }}
          >
            <PlusIcon />
            New flag
          </Button>
        }
      />
      <Card>
        <DataTable
          columns={columns}
          data={flags.data ?? EMPTY}
          isPending={flags.isPending}
          error={flags.error}
          onRetry={() => void flags.refetch()}
          emptyText="No feature flags yet."
          getRowId={(f) => f.key}
        />
      </Card>

      <FlagDialog
        flag={editing?.flag ?? null}
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      />
      <ReasonDialog
        open={toggling !== null}
        onOpenChange={(o) => {
          if (!o) setToggling(null);
        }}
        title={toggling ? `${toggling.enabled ? 'Disable' : 'Enable'} ${toggling.key}?` : ''}
        description={
          toggling?.enabled
            ? 'The feature is switched off for all households immediately.'
            : 'The feature rolls out according to the rollout % and allowlist.'
        }
        confirmLabel={toggling?.enabled ? 'Disable' : 'Enable'}
        destructive={toggling?.enabled}
        successMessage="Flag updated"
        onConfirm={async (reason) => {
          if (!toggling) return;
          await api.upsertFlag(
            { params: { key: toggling.key }, body: { enabled: !toggling.enabled } },
            withReason(reason),
          );
          await qc.invalidateQueries({ queryKey: ['flags'] });
        }}
      />
    </>
  );
}
