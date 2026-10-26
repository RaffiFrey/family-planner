'use client';

import type { HomeAsset } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
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
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';

export const ASSET_KINDS = ['home', 'vehicle', 'appliance', 'other'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

interface FormValues {
  kind: AssetKind;
  name: string;
  purchaseDate: string;
  warrantyUntil: string;
  notes: string;
  details: { key: string; value: string }[];
}

export function AssetDialog({
  open,
  onOpenChange,
  asset,
  defaultKind = 'home',
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: HomeAsset | null;
  defaultKind?: AssetKind;
  onSaved?: (asset: HomeAsset) => void;
}) {
  const t = useTranslations('homeAssets');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();

  const defaults = React.useCallback(
    (): FormValues => ({
      kind: asset?.kind ?? defaultKind,
      name: asset?.name ?? '',
      purchaseDate: asset?.purchaseDate ?? '',
      warrantyUntil: asset?.warrantyUntil ?? '',
      notes: asset?.notes ?? '',
      details: asset
        ? Object.entries(asset.details).map(([key, value]) => ({ key, value }))
        : [{ key: '', value: '' }],
    }),
    [asset, defaultKind],
  );
  const { register, handleSubmit, reset, setError, control, formState } = useForm<FormValues>({
    defaultValues: defaults(),
  });
  const details = useFieldArray({ control, name: 'details' });
  React.useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset, defaults]);
  const kind = useWatch({ control, name: 'kind' });

  const mutation = useMutation({
    mutationFn: (v: FormValues) => {
      const body = {
        kind: v.kind,
        name: v.name.trim(),
        purchaseDate: v.purchaseDate || null,
        warrantyUntil: v.warrantyUntil || null,
        notes: v.notes.trim() || null,
        details: Object.fromEntries(
          v.details
            .filter((d) => d.key.trim() && d.value.trim())
            .map((d) => [d.key.trim().slice(0, 40), d.value.trim()]),
        ),
      };
      return asset
        ? api.home.assets.update({ params: { householdId, assetId: asset.id }, body })
        : api.home.assets.create({ params: { householdId }, body });
    },
    onSuccess: async (saved) => {
      toast.success(t('assets.saved'));
      onOpenChange(false);
      onSaved?.(saved);
      await queryClient.invalidateQueries({ queryKey: ['home'] });
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{asset ? t('assets.edit') : t('assets.add')}</DialogTitle>
          <DialogDescription className="sr-only">{t('description')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => void handleSubmit((v) => mutation.mutate(v))(e)}
          className="grid gap-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field label={t('assets.name')} error={formState.errors.name?.message}>
              {(p) => (
                <Input
                  {...p}
                  placeholder={t('assets.namePlaceholder')}
                  {...register('name', { validate: (v) => v.trim().length > 0 || tu('required') })}
                />
              )}
            </Field>
            <Field label={t('assets.kind')}>
              {(p) => (
                <NativeSelect {...p} {...register('kind')}>
                  {ASSET_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`kinds.${k}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('assets.purchaseDate')}>
              {(p) => <Input {...p} type="date" {...register('purchaseDate')} />}
            </Field>
            <Field label={t('assets.warrantyUntil')}>
              {(p) => <Input {...p} type="date" {...register('warrantyUntil')} />}
            </Field>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">
              {t('assets.details')}{' '}
              <span className="font-normal text-muted">
                ({t(`assets.detailSuggestions.${kind}`)})
              </span>
            </legend>
            {details.fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
                <Input aria-label={t('assets.detailKey')} {...register(`details.${i}.key`)} />
                <Input aria-label={t('assets.detailValue')} {...register(`details.${i}.value`)} />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('assets.removeDetail')}
                  onClick={() => details.remove(i)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            <div>
              <Button
                variant="secondary"
                size="sm"
                disabled={details.fields.length >= 30}
                onClick={() => details.append({ key: '', value: '' })}
              >
                <Plus aria-hidden />
                {t('assets.addDetail')}
              </Button>
            </div>
          </fieldset>
          <Field label={t('assets.notes')}>
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
