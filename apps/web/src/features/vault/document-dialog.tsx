'use client';

import { VaultDocumentType, type VaultDocument } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { MemberPicker } from '@/components/member-picker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';

type DocType = VaultDocument['type'];
type Visibility = VaultDocument['visibility'];

interface FormValues {
  type: DocType;
  title: string;
  holderMemberId: string;
  issuer: string;
  documentNumber: string;
  issuedOn: string;
  expiresOn: string;
  notes: string;
  tags: string;
  reminders: string;
  visibility: Visibility;
  sharedWith: string[];
}

function parseReminders(input: string): number[] | null | 'invalid' {
  const parts = input
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const nums = parts.map(Number);
  if (nums.length > 5 || nums.some((n) => !Number.isInteger(n) || n < 0 || n > 730))
    return 'invalid';
  return [...new Set(nums)].sort((a, b) => b - a);
}

/** Create or edit a vault document. `doc` must come from the single-document endpoint. */
export function DocumentDialog({
  open,
  onOpenChange,
  doc,
  defaultHolderId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: VaultDocument | null;
  defaultHolderId?: string;
}) {
  const t = useTranslations('vault');
  const tv = useTranslations('visibility');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { householdId, members, member } = useHousehold();
  const toastError = useToastError();

  const defaults = React.useCallback(
    (): FormValues => ({
      type: doc?.type ?? 'id_card',
      title: doc?.title ?? '',
      holderMemberId: doc ? (doc.holderMemberId ?? '') : (defaultHolderId ?? ''),
      issuer: doc?.issuer ?? '',
      documentNumber: doc?.documentNumber ?? '',
      issuedOn: doc?.issuedOn ?? '',
      expiresOn: doc?.expiresOn ?? '',
      notes: doc?.notes ?? '',
      tags: doc?.tags.join(', ') ?? '',
      reminders: doc?.reminderLeadDays.join(', ') ?? '',
      visibility: doc?.visibility ?? 'household',
      sharedWith: doc?.sharedWith ?? [],
    }),
    [doc, defaultHolderId],
  );
  const { register, handleSubmit, reset, setError, control, formState } = useForm<FormValues>({
    defaultValues: defaults(),
  });
  React.useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset, defaults]);
  const visibility = useWatch({ control, name: 'visibility' });

  const mutation = useMutation({
    mutationFn: (body: {
      type: DocType;
      title: string;
      holderMemberId: string | null;
      issuer: string | null;
      documentNumber: string | null;
      issuedOn: string | null;
      expiresOn: string | null;
      notes: string | null;
      tags: string[];
      reminderLeadDays: number[] | null;
      visibility: Visibility;
      sharedWith: string[] | null;
    }) =>
      doc
        ? api.vault.update({ params: { householdId, documentId: doc.id }, body })
        : api.vault.create({ params: { householdId }, body }),
    onSuccess: async (saved) => {
      toast.success(doc ? t('saved') : t('created'));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['vault'] });
      if (!doc) router.push(`/vault/${saved.id}`);
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  const onSubmit = handleSubmit((v) => {
    if (v.issuedOn && v.expiresOn && v.expiresOn < v.issuedOn) {
      setError('expiresOn', { message: t('endBeforeStart') });
      return;
    }
    const reminders = parseReminders(v.reminders);
    if (reminders === 'invalid') {
      setError('reminders', { message: t('invalidReminders') });
      return;
    }
    mutation.mutate({
      type: v.type,
      title: v.title.trim(),
      holderMemberId: v.holderMemberId || null,
      issuer: v.issuer.trim() || null,
      documentNumber: v.documentNumber.trim() || null,
      issuedOn: v.issuedOn || null,
      expiresOn: v.expiresOn || null,
      notes: v.notes.trim() || null,
      tags: [
        ...new Set(
          v.tags
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ],
      reminderLeadDays: reminders,
      visibility: v.visibility,
      sharedWith: v.visibility === 'members' ? v.sharedWith : null,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{doc ? t('edit') : t('add')}</DialogTitle>
          <DialogDescription className="sr-only">{t('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('type')}>
              {(p) => (
                <NativeSelect {...p} {...register('type')}>
                  {VaultDocumentType.options.map((k) => (
                    <option key={k} value={k}>
                      {t(`types.${k}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('holder')}>
              {(p) => (
                <NativeSelect {...p} {...register('holderMemberId')}>
                  <option value="">{t('household')}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>
          <Field label={t('docTitle')} error={formState.errors.title?.message}>
            {(p) => <Input {...p} {...register('title', { required: tu('required') })} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('issuer')}>{(p) => <Input {...p} {...register('issuer')} />}</Field>
            <Field
              label={t('documentNumber')}
              hint={t('documentNumberHint')}
              error={formState.errors.documentNumber?.message}
            >
              {(p) => <Input {...p} autoComplete="off" {...register('documentNumber')} />}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('issuedOn')} error={formState.errors.issuedOn?.message}>
              {(p) => <Input type="date" {...p} {...register('issuedOn')} />}
            </Field>
            <Field label={t('expiresOn')} error={formState.errors.expiresOn?.message}>
              {(p) => <Input type="date" {...p} {...register('expiresOn')} />}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('tags')} hint={t('tagsHint')}>
              {(p) => <Input {...p} {...register('tags')} />}
            </Field>
            <Field
              label={t('reminders')}
              hint={t('remindersHint')}
              error={formState.errors.reminders?.message}
            >
              {(p) => <Input {...p} inputMode="numeric" {...register('reminders')} />}
            </Field>
          </div>
          <Field label={t('notes')}>
            {(p) => <Textarea {...p} rows={3} {...register('notes')} />}
          </Field>
          <Field label={t('visibility')}>
            {(p) => (
              <NativeSelect {...p} {...register('visibility')}>
                <option value="household">{tv('household')}</option>
                <option value="members">{tv('members')}</option>
                <option value="private">{tv('private')}</option>
              </NativeSelect>
            )}
          </Field>
          {visibility === 'members' ? (
            <div className="grid gap-1.5">
              <Label>{t('sharedWith')}</Label>
              <Controller
                control={control}
                name="sharedWith"
                render={({ field }) => (
                  <MemberPicker
                    value={field.value}
                    onChange={field.onChange}
                    members={members.filter((m) => m.id !== member.id)}
                    label={t('sharedWith')}
                  />
                )}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {tc('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
