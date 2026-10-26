'use client';

import { apiQuery } from '@fp/api-client';
import type { Contact, EmergencyCard, Member } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { MemberAvatar } from '@/components/member-avatar';
import { ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
import { useFormat } from '@/lib/use-format';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', '0+', '0-', 'unknown'] as const;
type BloodType = (typeof BLOOD_TYPES)[number];

export function EmergencyCards() {
  const t = useTranslations('contacts.emergency');
  const tc = useTranslations('common');
  const fmt = useFormat();
  const { householdId, members, can } = useHousehold();
  const canWrite = can('contacts.write');
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const query = useQuery({
    queryKey: ['contacts', 'emergency.list', householdId],
    queryFn: () => api.contacts.emergency.list({ params: { householdId } }),
  });
  const contacts = useQuery(apiQuery(api, 'contacts', 'list', { params: { householdId } }));
  const [editing, setEditing] = React.useState<Member | null>(null);
  const [deleting, setDeleting] = React.useState<Member | null>(null);

  const remove = useMutation({
    mutationFn: (m: Member) =>
      api.contacts.emergency.remove({ params: { householdId, memberId: m.id } }),
    onSuccess: async () => {
      setDeleting(null);
      toast.success(t('deleted'));
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: toastError,
  });

  if (query.isPending) return <LoadingState rows={3} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const byMember = new Map(query.data.map((c) => [c.memberId, c]));
  const contactById = new Map((contacts.data ?? []).map((c) => [c.id, c]));

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">{t('description')}</p>
      <ul className="grid gap-3 md:grid-cols-2">
        {members.map((m) => {
          const card = byMember.get(m.id);
          return (
            <li key={m.id}>
              <Card className="h-full">
                <CardHeader className="flex-row items-center gap-3">
                  <MemberAvatar member={m} size="md" />
                  <CardTitle className="min-w-0 flex-1 truncate">{m.displayName}</CardTitle>
                  {card?.bloodType && card.bloodType !== 'unknown' ? (
                    <Badge variant="danger" aria-label={`${t('bloodType')}: ${card.bloodType}`}>
                      {card.bloodType}
                    </Badge>
                  ) : null}
                </CardHeader>
                <CardContent className="grid gap-3">
                  {card ? (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                      <dt className="text-muted">{t('allergies')}</dt>
                      <dd>{card.allergies.join(', ') || t('none')}</dd>
                      <dt className="text-muted">{t('conditions')}</dt>
                      <dd>{card.conditions.join(', ') || t('none')}</dd>
                      <dt className="text-muted">{t('emergencyContacts')}</dt>
                      <dd>
                        {card.emergencyContactIds
                          .map((id) => contactById.get(id)?.name)
                          .filter(Boolean)
                          .join(', ') || t('none')}
                      </dd>
                    </dl>
                  ) : (
                    <p className="text-sm text-muted">{t('noCard')}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {card ? (
                      <Button variant="secondary" size="sm" asChild>
                        <Link href={`/contacts/emergency/${m.id}`}>
                          <Printer aria-hidden />
                          {t('print')}
                        </Link>
                      </Button>
                    ) : null}
                    {canWrite ? (
                      <Button
                        variant={card ? 'ghost' : 'default'}
                        size="sm"
                        onClick={() => setEditing(m)}
                        aria-label={`${card ? t('edit') : t('create')}: ${m.displayName}`}
                      >
                        {card ? <Pencil aria-hidden /> : <Plus aria-hidden />}
                        {card ? t('edit') : t('create')}
                      </Button>
                    ) : null}
                    {canWrite && card ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleting(m)}
                        aria-label={`${tc('delete')}: ${m.displayName}`}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                  {card ? (
                    <p className="text-xs text-muted">
                      {t('updated', { date: fmt.date(card.updatedAt) })}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
      <EmergencyCardDialog
        member={editing}
        card={editing ? (byMember.get(editing.id) ?? null) : null}
        contacts={contacts.data ?? []}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('deleteTitle', { name: deleting?.displayName ?? '' })}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

interface FormValues {
  bloodType: BloodType | '';
  allergies: string;
  conditions: string;
  medications: string;
  insuranceProvider: string;
  insuranceNumber: string;
  doctorContactId: string;
  emergencyContactIds: string[];
  notes: string;
}

const splitList = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
const orNull = (s: string) => (s.trim() ? s.trim() : null);

function EmergencyCardDialog({
  member,
  card,
  contacts,
  onClose,
}: {
  member: Member | null;
  card: EmergencyCard | null;
  contacts: Contact[];
  onClose: () => void;
}) {
  const t = useTranslations('contacts.emergency');
  const tc = useTranslations('common');
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const open = member !== null;

  const defaults = React.useCallback(
    (): FormValues => ({
      bloodType: card?.bloodType ?? '',
      allergies: card?.allergies.join(', ') ?? '',
      conditions: card?.conditions.join(', ') ?? '',
      medications: card?.medications ?? '',
      insuranceProvider: card?.insuranceProvider ?? '',
      insuranceNumber: card?.insuranceNumber ?? '',
      doctorContactId: card?.doctorContactId ?? '',
      emergencyContactIds: card?.emergencyContactIds ?? [],
      notes: card?.notes ?? '',
    }),
    [card],
  );
  const { register, handleSubmit, reset, setError, control } = useForm<FormValues>({
    defaultValues: defaults(),
  });
  React.useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset, defaults]);

  const mutation = useMutation({
    mutationFn: (v: FormValues) => {
      if (!member) throw new Error('no member');
      const insurance = orNull(v.insuranceNumber);
      return api.contacts.emergency.upsert({
        params: { householdId, memberId: member.id },
        body: {
          bloodType: v.bloodType || null,
          allergies: splitList(v.allergies),
          conditions: splitList(v.conditions),
          medications: orNull(v.medications),
          insuranceProvider: orNull(v.insuranceProvider),
          // A masked number (no clear text returned) stays untouched when left empty.
          ...(insurance !== null || card?.insuranceNumber ? { insuranceNumber: insurance } : {}),
          doctorContactId: v.doctorContactId || null,
          emergencyContactIds: v.emergencyContactIds,
          notes: orNull(v.notes),
        },
      });
    },
    onSuccess: async () => {
      toast.success(t('saved'));
      onClose();
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  const onSubmit = handleSubmit((v) => mutation.mutate(v));
  const doctors = [...contacts].sort(
    (a, b) => Number(b.category === 'doctor') - Number(a.category === 'doctor'),
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('editTitle', { name: member?.displayName ?? '' })}</DialogTitle>
          <DialogDescription>{t('offlineNote')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('bloodType')}>
              {(p) => (
                <NativeSelect {...p} {...register('bloodType')}>
                  <option value="">{t('none')}</option>
                  {BLOOD_TYPES.map((b) => (
                    <option key={b} value={b}>
                      {b === 'unknown' ? t('bloodUnknown') : b}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('doctor')}>
              {(p) => (
                <NativeSelect {...p} {...register('doctorContactId')}>
                  <option value="">{t('noDoctor')}</option>
                  {doctors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.organization ? ` (${c.organization})` : ''}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>
          <Field label={t('allergies')} hint={t('listHint')}>
            {(p) => <Input {...p} {...register('allergies')} />}
          </Field>
          <Field label={t('conditions')} hint={t('listHint')}>
            {(p) => <Input {...p} {...register('conditions')} />}
          </Field>
          <Field label={t('medications')}>
            {(p) => <Textarea {...p} rows={2} {...register('medications')} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('insuranceProvider')}>
              {(p) => <Input {...p} {...register('insuranceProvider')} />}
            </Field>
            <Field
              label={t('insuranceNumber')}
              hint={
                card && !card.insuranceNumber && card.insuranceNumberLast4
                  ? t('insuranceMasked', { last4: card.insuranceNumberLast4 })
                  : undefined
              }
            >
              {(p) => <Input {...p} autoComplete="off" {...register('insuranceNumber')} />}
            </Field>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t('emergencyContacts')}</legend>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted">{t('noContactsYet')}</p>
            ) : (
              <Controller
                control={control}
                name="emergencyContactIds"
                render={({ field }) => (
                  <ul className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
                    {contacts.map((c) => {
                      const id = `ec-${c.id}`;
                      const checked = field.value.includes(c.id);
                      return (
                        <li key={c.id} className="flex items-center gap-2">
                          <Checkbox
                            id={id}
                            checked={checked}
                            onCheckedChange={(v) =>
                              field.onChange(
                                v === true
                                  ? [...field.value, c.id]
                                  : field.value.filter((x) => x !== c.id),
                              )
                            }
                          />
                          <Label htmlFor={id} className="font-normal">
                            {c.name}
                          </Label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              />
            )}
          </fieldset>
          <Field label={t('notes')}>
            {(p) => <Textarea {...p} rows={2} {...register('notes')} />}
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
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
