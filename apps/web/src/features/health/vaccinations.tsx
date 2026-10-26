'use client';

import { apiQuery } from '@fp/api-client';
import type { Member, Vaccination } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreVertical, Pencil, Plus, Syringe, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { addDaysIso, todayIso } from './dates';

function vaccKey(householdId: string, memberId: string) {
  return ['health', 'vaccinations.list', householdId, memberId] as const;
}

export function VaccinationsPanel({ member }: { member: Member }) {
  const t = useTranslations('health.vaccinations');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId, can } = useHousehold();
  const canWrite = can('health.write');
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const query = useQuery({
    queryKey: vaccKey(householdId, member.id),
    queryFn: () =>
      api.health.vaccinations.list({ params: { householdId }, query: { memberId: member.id } }),
  });
  const [dialog, setDialog] = React.useState<{ open: boolean; item: Vaccination | null }>({
    open: false,
    item: null,
  });
  const [deleting, setDeleting] = React.useState<Vaccination | null>(null);

  const remove = useMutation({
    mutationFn: (v: Vaccination) =>
      api.health.vaccinations.remove({ params: { householdId, vaccinationId: v.id } }),
    onMutate: async (v) => {
      const key = vaccKey(householdId, member.id);
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<Vaccination[]>(key);
      queryClient.setQueryData<Vaccination[]>(key, (old) => old?.filter((x) => x.id !== v.id));
      return { prev };
    },
    onError: (err, _v, ctx) => {
      queryClient.setQueryData(vaccKey(householdId, member.id), ctx?.prev);
      toastError(err);
    },
    onSuccess: () => {
      setDeleting(null);
      toast.success(t('deleted'));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['health'] }),
  });

  const today = todayIso();
  const soon = addDaysIso(today, 60);
  const addButton = canWrite ? (
    <Button onClick={() => setDialog({ open: true, item: null })}>
      <Plus aria-hidden />
      {t('add')}
    </Button>
  ) : null;

  if (query.isPending) return <LoadingState rows={3} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const items = [...query.data].sort((a, b) => b.givenOn.localeCompare(a.givenOn));

  return (
    <div className="grid gap-4">
      {items.length > 0 && addButton ? <div className="flex justify-end">{addButton}</div> : null}
      {items.length === 0 ? (
        <EmptyState
          icon={<Syringe />}
          title={t('empty')}
          description={t('emptyHint')}
          action={addButton}
        />
      ) : (
        <ul className="grid gap-2">
          {items.map((v) => (
            <li key={v.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 pt-4">
                  <Syringe className="size-5 text-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {v.vaccine}
                      {v.dose ? <span className="text-muted"> · {v.dose}</span> : null}
                    </p>
                    <p className="text-sm text-muted">
                      {fmt.date(v.givenOn)}
                      {v.batch ? ` · ${t('batch')} ${v.batch}` : ''}
                    </p>
                    {v.notes ? <p className="text-sm">{v.notes}</p> : null}
                  </div>
                  {v.nextDueOn ? (
                    <Badge
                      variant={
                        v.nextDueOn < today
                          ? 'danger'
                          : v.nextDueOn <= soon
                            ? 'warning'
                            : 'secondary'
                      }
                    >
                      {v.nextDueOn < today
                        ? t('overdue', { date: fmt.date(v.nextDueOn) })
                        : v.nextDueOn <= soon
                          ? t('dueSoon', { date: fmt.date(v.nextDueOn) })
                          : t('dueOn', { date: fmt.date(v.nextDueOn) })}
                    </Badge>
                  ) : null}
                  {canWrite ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={tu('actions')}>
                          <MoreVertical aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setDialog({ open: true, item: v })}>
                          <Pencil aria-hidden />
                          {tc('edit')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(v)}>
                          <Trash2 aria-hidden />
                          {tc('delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <VaccinationDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        item={dialog.item}
        member={member}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('deleteTitle', { name: deleting?.vaccine ?? '' })}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

interface FormValues {
  vaccine: string;
  givenOn: string;
  dose: string;
  nextDueOn: string;
  doctorContactId: string;
  batch: string;
  notes: string;
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

function VaccinationDialog({
  open,
  onOpenChange,
  item,
  member,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: Vaccination | null;
  member: Member;
}) {
  const t = useTranslations('health.vaccinations');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const doctors = useQuery({
    ...apiQuery(api, 'contacts', 'list', { params: { householdId } }),
    enabled: open,
  });

  const defaults = React.useCallback(
    (): FormValues => ({
      vaccine: item?.vaccine ?? '',
      givenOn: item?.givenOn ?? todayIso(),
      dose: item?.dose ?? '',
      nextDueOn: item?.nextDueOn ?? '',
      doctorContactId: item?.doctorContactId ?? '',
      batch: item?.batch ?? '',
      notes: item?.notes ?? '',
    }),
    [item],
  );
  const { register, handleSubmit, reset, setError, formState } = useForm<FormValues>({
    defaultValues: defaults(),
  });
  React.useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset, defaults]);

  const mutation = useMutation({
    mutationFn: (v: FormValues) => {
      const body = {
        vaccine: v.vaccine.trim(),
        givenOn: v.givenOn,
        dose: orNull(v.dose),
        nextDueOn: v.nextDueOn || null,
        doctorContactId: v.doctorContactId || null,
        batch: orNull(v.batch),
        notes: orNull(v.notes),
      };
      return item
        ? api.health.vaccinations.update({
            params: { householdId, vaccinationId: item.id },
            body,
          })
        : api.health.vaccinations.create({
            params: { householdId },
            body: { ...body, memberId: member.id },
          });
    },
    onSuccess: async () => {
      toast.success(t('saved'));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['health'] });
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  const onSubmit = handleSubmit((v) => mutation.mutate(v));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? t('edit') : t('add')}</DialogTitle>
          <DialogDescription>{member.displayName}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <Field label={t('vaccine')} error={formState.errors.vaccine?.message}>
            {(p) => (
              <Input
                {...p}
                placeholder={t('vaccinePlaceholder')}
                {...register('vaccine', {
                  validate: (v) => v.trim().length > 0 || tu('required'),
                })}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('givenOn')} error={formState.errors.givenOn?.message}>
              {(p) => (
                <Input {...p} type="date" {...register('givenOn', { required: tu('required') })} />
              )}
            </Field>
            <Field label={t('dose')}>
              {(p) => <Input {...p} placeholder={t('dosePlaceholder')} {...register('dose')} />}
            </Field>
            <Field label={t('nextDueOn')}>
              {(p) => <Input {...p} type="date" {...register('nextDueOn')} />}
            </Field>
            <Field label={t('batch')}>{(p) => <Input {...p} {...register('batch')} />}</Field>
          </div>
          <Field label={t('doctor')}>
            {(p) => (
              <NativeSelect {...p} {...register('doctorContactId')}>
                <option value="">{t('noDoctor')}</option>
                {(doctors.data ?? [])
                  .filter((c) => c.category === 'doctor' || c.id === item?.doctorContactId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={t('notes')}>
            {(p) => <Textarea {...p} rows={2} {...register('notes')} />}
          </Field>
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
