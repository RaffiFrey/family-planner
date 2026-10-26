'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { errorMessage } from '@/lib/api';

/** Mirrors the contract: every mutating admin action needs a reason for the staff audit log. */
export const reasonSchema = z
  .string()
  .trim()
  .min(5, 'Please give a reason (at least 5 characters).')
  .max(500);

/** Reusable reason textarea for forms whose schema has a `reason` field. */
export function ReasonField<T extends { reason: string }>({
  register,
  errors,
  id = 'reason',
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  id?: string;
}) {
  const reg = (register as unknown as UseFormRegister<{ reason: string }>)('reason');
  const err = (errors as FieldErrors<{ reason: string }>).reason?.message;
  return (
    <Field
      label="Reason (audit log)"
      htmlFor={id}
      error={err}
      hint="Stored in the staff audit log. Min. 5 characters."
    >
      <Textarea
        id={id}
        rows={2}
        placeholder="e.g. Ticket #1234: customer requested..."
        aria-invalid={err ? true : undefined}
        {...reg}
      />
    </Field>
  );
}

const schema = z.object({ reason: reasonSchema });
type Values = z.input<typeof schema>;

interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** Throwing keeps the dialog open and shows the error as a toast. */
  onConfirm: (reason: string) => Promise<void>;
  successMessage?: string;
}

/** Confirmation dialog that collects the mandatory audit reason before a mutation is sent. */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive,
  onConfirm,
  successMessage,
}: ReasonDialogProps) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { reason: '' } });
  const { reset } = form;

  React.useEffect(() => {
    if (open) reset({ reason: '' });
  }, [open, reset]);

  const submit = form.handleSubmit(async ({ reason }) => {
    try {
      await onConfirm(reason.trim());
      if (successMessage) toast.success(successMessage);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <ReasonField register={form.register} errors={form.formState.errors} />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={destructive ? 'destructive' : 'default'}
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? 'Saving...' : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
