'use client';

import { CreateHouseholdBody } from '@fp/contracts';
import { SUPPORTED_CURRENCIES } from '@fp/domain/money';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { ColorPicker } from '@/components/color-picker';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHouseholdSelection } from '@/features/household/household-store';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { COLOR_PRESETS } from '@/lib/utils';

type FormValues = z.input<typeof CreateHouseholdBody>;

function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['Europe/Berlin', 'Europe/Vienna', 'Europe/Zurich'];
  }
}

export function CreateHouseholdForm({ defaultDisplayName }: { defaultDisplayName: string }) {
  const t = useTranslations('onboarding');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const setHouseholdId = useHouseholdSelection((s) => s.setHouseholdId);
  const toastError = useToastError();
  const zones = React.useMemo(() => timeZones(), []);

  const form = useForm<FormValues>({
    resolver: zodResolver(CreateHouseholdBody),
    defaultValues: {
      name: '',
      timezone: 'Europe/Berlin',
      currency: 'EUR',
      locale,
      displayName: defaultDisplayName,
      color: COLOR_PRESETS[0],
    },
  });

  React.useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && zones.includes(tz)) form.setValue('timezone', tz);
  }, [form, zones]);

  const create = useMutation({
    mutationFn: (body: FormValues) => api.households.create({ body }),
    onSuccess: async (detail) => {
      setHouseholdId(detail.household.id);
      await queryClient.invalidateQueries({ queryKey: ['households'] });
      toast.success(t('created'));
      router.replace('/');
    },
    onError: (err) => {
      if (!applyFieldErrors(err, form.setError)) toastError(err);
    },
  });

  const { errors } = form.formState;
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => void form.handleSubmit((v) => create.mutate(v))(e)}
      noValidate
    >
      <Field label={t('householdName')} error={errors.name?.message}>
        {(p) => (
          <Input {...p} placeholder={t('householdNamePlaceholder')} {...form.register('name')} />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('timezone')} error={errors.timezone?.message}>
          {(p) => (
            <NativeSelect {...p} {...form.register('timezone')}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replaceAll('_', ' ')}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label={t('currency')} error={errors.currency?.message}>
          {(p) => (
            <NativeSelect {...p} {...form.register('currency')}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>
      <Field label={t('displayName')} error={errors.displayName?.message}>
        {(p) => <Input {...p} autoComplete="nickname" {...form.register('displayName')} />}
      </Field>
      <div className="grid gap-2">
        <Label asChild>
          <span>{t('yourColor')}</span>
        </Label>
        <Controller
          control={form.control}
          name="color"
          render={({ field }) => (
            <ColorPicker
              value={field.value ?? COLOR_PRESETS[0]}
              onChange={field.onChange}
              label={t('yourColor')}
            />
          )}
        />
      </div>
      <Button type="submit" size="lg" loading={create.isPending}>
        {t('create')}
      </Button>
    </form>
  );
}
