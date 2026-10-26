'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheckIcon, ShieldAlertIcon, UserPlusIcon } from 'lucide-react';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { StaffRole, type StaffUser } from '@fp/contracts';
import { columnHelper, DataTable } from '@/components/data-table';
import { ReasonField, reasonSchema } from '@/components/reason-dialog';
import { useCan } from '@/components/staff-context';
import { PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';
import { api, errorMessage, withReason } from '@/lib/api';
import { fmtRelative } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/permissions';

type Staff = z.infer<typeof StaffUser>;
const EMPTY: Staff[] = [];
const h = columnHelper<Staff>();

const ROLE_HINTS: Record<z.infer<typeof StaffRole>, string> = {
  support: 'Users, households, GDPR queue',
  billing: 'Subscriptions, complimentary plans',
  ops: 'Feature flags, announcements, global finance rules',
  superadmin: 'Everything, incl. staff management',
};

const columns = h.columns([
  h.accessor('name', {
    header: 'Name',
    cell: (c) => (
      <div className="grid">
        <span className="font-medium">{c.getValue()}</span>
        <span className="text-xs text-muted">{c.row.original.email}</span>
      </div>
    ),
  }),
  h.accessor('roles', {
    header: 'Roles',
    cell: (c) => (
      <div className="flex flex-wrap gap-1">
        {c.getValue().map((r) => (
          <Badge key={r} variant={r === 'superadmin' ? 'primary' : 'outline'}>
            {ROLE_LABELS[r]}
          </Badge>
        ))}
      </div>
    ),
  }),
  h.accessor('totpEnabled', {
    header: '2FA',
    cell: (c) =>
      c.getValue() ? (
        <Badge variant="success">
          <ShieldCheckIcon className="size-3" />
          TOTP
        </Badge>
      ) : (
        <Badge variant="warning">
          <ShieldAlertIcon className="size-3" />
          pending
        </Badge>
      ),
  }),
  h.accessor('lastLoginAt', {
    header: 'Last login',
    cell: (c) => <span className="text-xs text-muted">{fmtRelative(c.getValue())}</span>,
  }),
]);

const createSchema = z.object({
  email: z.email('Valid email required'),
  name: z.string().trim().min(1, 'Required'),
  roles: z.array(StaffRole).min(1, 'Select at least one role'),
  password: z.string().min(12, 'At least 12 characters'),
  reason: reasonSchema,
});
type CreateValues = z.input<typeof createSchema>;

function CreateStaffDialog({
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
    if (open) reset({ email: '', name: '', roles: ['support'], password: '', reason: '' });
  }, [open, reset]);

  const submit = form.handleSubmit(async ({ reason, ...body }) => {
    try {
      const created = await api.createStaff({ body }, withReason(reason));
      await qc.invalidateQueries({ queryKey: ['staff'] });
      toast.success(`${created.name} created. They must enrol TOTP on first sign-in.`);
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
            <DialogTitle>New staff member</DialogTitle>
            <DialogDescription>
              Share the initial password over a secure channel. TOTP enrolment is enforced on first
              sign-in.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="staff-name" error={errors.name?.message}>
              <Input id="staff-name" autoFocus {...form.register('name')} />
            </Field>
            <Field label="Email" htmlFor="staff-email" error={errors.email?.message}>
              <Input id="staff-email" type="email" autoComplete="off" {...form.register('email')} />
            </Field>
          </div>
          <Field
            label="Initial password"
            htmlFor="staff-pw"
            error={errors.password?.message}
            hint="At least 12 characters."
          >
            <Input
              id="staff-pw"
              type="password"
              autoComplete="new-password"
              {...form.register('password')}
            />
          </Field>
          <fieldset className="grid gap-2">
            <Label asChild>
              <legend>Roles</legend>
            </Label>
            <Controller
              control={form.control}
              name="roles"
              render={({ field }) => (
                <div className="grid gap-1.5">
                  {StaffRole.options.map((r) => {
                    const checked = field.value.includes(r);
                    return (
                      <label key={r} className="flex items-start gap-2 text-sm">
                        <Checkbox
                          className="mt-0.5"
                          checked={checked}
                          onCheckedChange={(v) => {
                            field.onChange(
                              v === true ? [...field.value, r] : field.value.filter((x) => x !== r),
                            );
                          }}
                        />
                        <span>
                          <span className="font-medium">{ROLE_LABELS[r]}</span>
                          <span className="block text-xs text-muted">{ROLE_HINTS[r]}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            />
            {errors.roles?.message ? (
              <p className="text-xs text-danger">{errors.roles.message}</p>
            ) : null}
          </fieldset>
          <ReasonField register={form.register} errors={errors} id="staff-reason" />
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
              {form.formState.isSubmitting ? 'Creating...' : 'Create staff member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function StaffPage() {
  const canCreate = useCan('staff.create');
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api.staff() });
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <PageHeader
        title="Staff"
        description="Admin console accounts and their roles."
        actions={
          canCreate ? (
            <Button
              onClick={() => {
                setOpen(true);
              }}
            >
              <UserPlusIcon />
              New staff member
            </Button>
          ) : null
        }
      />
      <Card>
        <DataTable
          columns={columns}
          data={staff.data ?? EMPTY}
          isPending={staff.isPending}
          error={staff.error}
          onRetry={() => void staff.refetch()}
          emptyText="No staff accounts."
          getRowId={(s) => s.id}
        />
      </Card>
      {canCreate ? <CreateStaffDialog open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
