'use client';

import type { Household } from '@fp/contracts';
import { SUPPORTED_CURRENCIES } from '@fp/domain/money';
import type { Locale } from '@fp/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { Input, NativeSelect } from '@/components/ui/input';
import { useHousehold } from '@/features/household/household-context';
import { useHouseholdSelection } from '@/features/household/household-store';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { Section } from './section';
import { SupportAccessSection } from './support-access';

interface HouseholdValues {
  name: string;
  timezone: string;
  currency: Household['currency'];
  locale: Locale;
}

function timeZones(current: string): string[] {
  const all =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return all.includes(current) ? all : [current, ...all];
}

export function HouseholdPage() {
  const t = useTranslations('settings.household');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const { householdId, household, can } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const canManage = can('household.manage');
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const zones = React.useMemo(() => timeZones(household.timezone), [household.timezone]);

  const form = useForm<HouseholdValues>({
    values: {
      name: household.name,
      timezone: household.timezone,
      currency: household.currency,
      locale: household.locale,
    },
  });

  const save = useMutation({
    mutationFn: (v: HouseholdValues) =>
      api.households.update({ params: { householdId }, body: { ...v, name: v.name.trim() } }),
    onSuccess: async () => {
      toast.success(t('saved'));
      await queryClient.invalidateQueries({ queryKey: ['households'] });
    },
    onError: (err) => {
      if (!applyFieldErrors(err, form.setError)) toastError(err);
    },
  });

  return (
    <div className="grid gap-6">
      <Section title={t('title')} description={canManage ? t('description') : t('readOnly')}>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={form.handleSubmit((v) => save.mutate(v))}
          noValidate
        >
          <fieldset disabled={!canManage} className="contents">
            <Field
              label={t('name')}
              error={form.formState.errors.name?.message}
              className="sm:col-span-2"
            >
              {(control) => (
                <Input
                  {...control}
                  maxLength={80}
                  {...form.register('name', {
                    validate: (v) => v.trim().length > 0 || tu('required'),
                  })}
                />
              )}
            </Field>
            <Field label={t('timezone')} error={form.formState.errors.timezone?.message}>
              {(control) => (
                <NativeSelect {...control} {...form.register('timezone')}>
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z.replaceAll('_', ' ')}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('currency')} error={form.formState.errors.currency?.message}>
              {(control) => (
                <NativeSelect {...control} {...form.register('currency')}>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('locale')} error={form.formState.errors.locale?.message}>
              {(control) => (
                <NativeSelect {...control} {...form.register('locale')}>
                  <option value="de">Deutsch</option>
                  <option value="en">English</option>
                </NativeSelect>
              )}
            </Field>
          </fieldset>
          {canManage ? (
            <div className="sm:col-span-2">
              <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>
                {tc('save')}
              </Button>
            </div>
          ) : null}
        </form>
      </Section>

      {canManage ? <SupportAccessSection /> : null}

      {can('household.delete') ? (
        <Section title={t('dangerZone')} description={t('deleteHint')} tone="danger">
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 aria-hidden />
            {t('delete')}
          </Button>
          <DeleteHouseholdDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
        </Section>
      ) : null}
    </div>
  );
}

function DeleteHouseholdDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('settings.household');
  const tc = useTranslations('common');
  const { householdId, household } = useHousehold();
  const setHouseholdId = useHouseholdSelection((s) => s.setHouseholdId);
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const router = useRouter();
  const [typed, setTyped] = React.useState('');

  const remove = useMutation({
    mutationFn: () => api.households.remove({ params: { householdId } }),
    onSuccess: async () => {
      toast.success(t('deleted'));
      setHouseholdId(null);
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['households'] });
      router.push('/');
    },
    onError: toastError,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setTyped('');
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed === household.name) remove.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>{t('deleteBody', { name: household.name })}</DialogDescription>
          </DialogHeader>
          <Field label={t('deleteConfirmLabel')}>
            {(control) => (
              <Input
                {...control}
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            )}
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={typed !== household.name}
              loading={remove.isPending}
            >
              {t('delete')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
