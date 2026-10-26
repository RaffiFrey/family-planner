'use client';

import type { Contact, ContactCategory } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
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

export const CONTACT_CATEGORIES: ContactCategory[] = [
  'doctor',
  'school',
  'kita',
  'babysitter',
  'family',
  'emergency',
  'craftsman',
  'other',
];

const PHONE_RE = /^[+0-9 ()/.-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormValues {
  name: string;
  category: ContactCategory;
  organization: string;
  phones: { label: string; number: string }[];
  email: string;
  address: string;
  notes: string;
  memberIds: string[];
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

export function ContactDialog({
  open,
  onOpenChange,
  contact,
  defaultCategory = 'other',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  defaultCategory?: ContactCategory;
}) {
  const t = useTranslations('contacts');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();

  const defaults = React.useCallback(
    (): FormValues => ({
      name: contact?.name ?? '',
      category: contact?.category ?? defaultCategory,
      organization: contact?.organization ?? '',
      phones: contact?.phones.map((p) => ({ label: p.label ?? '', number: p.number })) ?? [
        { label: '', number: '' },
      ],
      email: contact?.email ?? '',
      address: contact?.address ?? '',
      notes: contact?.notes ?? '',
      memberIds: contact?.memberIds ?? [],
    }),
    [contact, defaultCategory],
  );
  const { register, handleSubmit, reset, setError, control, formState } = useForm<FormValues>({
    defaultValues: defaults(),
  });
  const phones = useFieldArray({ control, name: 'phones' });
  React.useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset, defaults]);

  const mutation = useMutation({
    mutationFn: (v: FormValues) => {
      const body = {
        name: v.name.trim(),
        category: v.category,
        organization: orNull(v.organization),
        phones: v.phones
          .filter((p) => p.number.trim())
          .map((p) => ({ label: orNull(p.label), number: p.number.trim() })),
        email: orNull(v.email),
        address: orNull(v.address),
        notes: orNull(v.notes),
        memberIds: v.memberIds,
      };
      return contact
        ? api.contacts.update({ params: { householdId, contactId: contact.id }, body })
        : api.contacts.create({ params: { householdId }, body });
    },
    onSuccess: async () => {
      toast.success(t('saved'));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  const onSubmit = handleSubmit((v) => mutation.mutate(v));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{contact ? t('edit') : t('add')}</DialogTitle>
          <DialogDescription className="sr-only">{t('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('fields.name')} error={formState.errors.name?.message}>
              {(p) => (
                <Input
                  {...p}
                  autoComplete="off"
                  {...register('name', {
                    required: tu('required'),
                    validate: (v) => v.trim().length > 0 || tu('required'),
                  })}
                />
              )}
            </Field>
            <Field label={t('fields.category')}>
              {(p) => (
                <NativeSelect {...p} {...register('category')}>
                  {CONTACT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`categories.${c}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>
          <Field label={t('fields.organization')}>
            {(p) => <Input {...p} {...register('organization')} />}
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t('fields.phones')}</legend>
            {phones.fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-[1fr_1.4fr_auto] items-start gap-2">
                <Input
                  aria-label={t('fields.phoneLabel')}
                  placeholder={t('fields.phoneLabelPlaceholder')}
                  {...register(`phones.${i}.label`)}
                />
                <div className="grid gap-1">
                  <Input
                    type="tel"
                    aria-label={t('fields.phoneNumber')}
                    aria-invalid={Boolean(formState.errors.phones?.[i]?.number)}
                    {...register(`phones.${i}.number`, {
                      validate: (v) => !v.trim() || PHONE_RE.test(v.trim()) || t('invalidPhone'),
                    })}
                  />
                  {formState.errors.phones?.[i]?.number ? (
                    <p role="alert" className="text-xs text-danger">
                      {formState.errors.phones[i].number.message}
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('fields.removePhone')}
                  onClick={() => phones.remove(i)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            <div>
              <Button
                variant="secondary"
                size="sm"
                disabled={phones.fields.length >= 10}
                onClick={() => phones.append({ label: '', number: '' })}
              >
                <Plus aria-hidden />
                {t('fields.addPhone')}
              </Button>
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('fields.email')} error={formState.errors.email?.message}>
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  {...register('email', {
                    validate: (v) => !v.trim() || EMAIL_RE.test(v.trim()) || t('invalidEmail'),
                  })}
                />
              )}
            </Field>
            <Field label={t('fields.address')}>
              {(p) => <Input {...p} {...register('address')} />}
            </Field>
          </div>
          <Field label={t('fields.notes')}>
            {(p) => <Textarea {...p} rows={2} {...register('notes')} />}
          </Field>
          <div className="grid gap-1.5">
            <Label>{t('fields.members')}</Label>
            <Controller
              control={control}
              name="memberIds"
              render={({ field }) => (
                <MemberPicker
                  value={field.value}
                  onChange={field.onChange}
                  label={t('fields.members')}
                />
              )}
            />
          </div>
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
