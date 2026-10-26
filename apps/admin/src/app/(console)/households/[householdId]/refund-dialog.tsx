'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ApiError } from '@fp/contracts';
import { ReasonField, reasonSchema } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { api, errorMessage } from '@/lib/api';
import { fmtEuroMinor, parseEuroToMinor } from '@/lib/format';

const refundSchema = z.object({
  paymentIntentId: z
    .string()
    .trim()
    .regex(/^pi_[A-Za-z0-9_]+$/, 'Stripe payment intent id, e.g. pi_3Nxyz...'),
  amount: z.string().refine((v) => {
    if (v.trim() === '') return true;
    const minor = parseEuroToMinor(v);
    return minor !== null && minor > 0;
  }, 'Enter a positive euro amount with at most 2 decimals, or leave empty'),
  reason: reasonSchema,
});
type RefundValues = z.input<typeof refundSchema>;

function refundError(err: unknown): string {
  if (err instanceof ApiError && err.status === 503)
    return 'Payments (Stripe) are not configured on this server.';
  if (err instanceof ApiError && err.status === 404)
    return 'This household has no Stripe customer or the payment intent was not found.';
  return errorMessage(err);
}

/** Full or partial Stripe refund of a payment that belongs to this household's customer. */
export function RefundDialog({
  householdId,
  open,
  onOpenChange,
}: {
  householdId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const form = useForm<RefundValues>({
    resolver: zodResolver(refundSchema),
    defaultValues: { paymentIntentId: '', amount: '', reason: '' },
  });
  const { reset } = form;
  React.useEffect(() => {
    if (open) reset({ paymentIntentId: '', amount: '', reason: '' });
  }, [open, reset]);

  const amountText = useWatch({ control: form.control, name: 'amount' });
  const preview = amountText.trim() ? parseEuroToMinor(amountText) : null;

  const submit = form.handleSubmit(async (v) => {
    const amountMinor = v.amount.trim() ? parseEuroToMinor(v.amount) : null;
    try {
      const res = await api.refund({
        params: { householdId },
        body: {
          paymentIntentId: v.paymentIntentId.trim(),
          ...(amountMinor ? { amountMinor } : {}),
          reason: v.reason.trim(),
        },
      });
      await qc.invalidateQueries({ queryKey: ['household', householdId] });
      toast.success(`Refund ${res.refundId}: ${fmtEuroMinor(res.amountMinor)} (${res.status})`);
      onOpenChange(false);
    } catch (err) {
      toast.error(refundError(err));
    }
  });

  const errors = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Refund payment</DialogTitle>
            <DialogDescription>
              Issues a refund in Stripe. The payment must belong to this household&apos;s Stripe
              customer. Leave the amount empty for a full refund.
            </DialogDescription>
          </DialogHeader>
          <Field
            label="Payment intent ID"
            htmlFor="refund-pi"
            error={errors.paymentIntentId?.message}
          >
            <Input
              id="refund-pi"
              placeholder="pi_..."
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              aria-invalid={errors.paymentIntentId ? true : undefined}
              {...form.register('paymentIntentId')}
            />
          </Field>
          <Field
            label="Amount in EUR (optional, partial refund)"
            htmlFor="refund-amount"
            error={errors.amount?.message}
            hint={
              preview !== null && preview > 0
                ? `Refunds ${fmtEuroMinor(preview)} (${preview} cents)`
                : 'Empty = full remaining amount. e.g. 4,99'
            }
          >
            <Input
              id="refund-amount"
              inputMode="decimal"
              placeholder="e.g. 4,99"
              autoComplete="off"
              aria-invalid={errors.amount ? true : undefined}
              {...form.register('amount')}
            />
          </Field>
          <ReasonField register={form.register} errors={errors} id="refund-reason" />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Refunding...' : 'Issue refund'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
