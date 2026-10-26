'use client';

import type { HomeAsset } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gauge, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Input, NativeSelect } from '@/components/ui/input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';

const METER_TYPES = ['electricity', 'gas', 'water', 'heating', 'mileage', 'other'] as const;
type MeterType = (typeof METER_TYPES)[number];
const DEFAULT_UNIT: Record<MeterType, string> = {
  electricity: 'kWh',
  gas: 'm³',
  water: 'm³',
  heating: 'kWh',
  mileage: 'km',
  other: '',
};

function defaultMeter(kind: HomeAsset['kind']): MeterType {
  return kind === 'vehicle' ? 'mileage' : kind === 'home' ? 'electricity' : 'other';
}

export function MetersSection({ asset }: { asset: HomeAsset }) {
  const t = useTranslations('homeAssets.meters');
  const tc = useTranslations('common');
  const fmt = useFormat();
  const { householdId, can } = useHousehold();
  const canWrite = can('home.write');
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const readings = useQuery({
    queryKey: ['home', 'meters.list', householdId, asset.id],
    queryFn: () => api.home.meters.list({ params: { householdId, assetId: asset.id } }),
  });
  const types = React.useMemo(
    () => METER_TYPES.filter((m) => readings.data?.some((r) => r.meterType === m)),
    [readings.data],
  );
  const [type, setType] = React.useState<MeterType | null>(null);
  const activeType = type && types.includes(type) ? type : (types[0] ?? null);
  const [adding, setAdding] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);

  const remove = useMutation({
    mutationFn: (readingId: string) =>
      api.home.meters.remove({ params: { householdId, readingId } }),
    onSuccess: async () => {
      setDeleting(null);
      toast.success(t('deleted'));
      await queryClient.invalidateQueries({ queryKey: ['home'] });
    },
    onError: toastError,
  });

  const list = (readings.data ?? [])
    .filter((r) => r.meterType === activeType)
    .sort((a, b) => b.readAt.localeCompare(a.readAt));
  const number = (v: string) =>
    new Intl.NumberFormat(fmt.intlLocale, { maximumFractionDigits: 3 }).format(Number(v));

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{t('title')}</CardTitle>
        {canWrite ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            {t('add')}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        {readings.isPending ? (
          <LoadingState rows={3} />
        ) : readings.isError ? (
          <ErrorState error={readings.error} onRetry={() => void readings.refetch()} />
        ) : !activeType ? (
          <EmptyState icon={<Gauge />} title={t('empty')} className="py-6" />
        ) : (
          <>
            {types.length > 1 ? (
              <NativeSelect
                aria-label={t('type')}
                value={activeType}
                onChange={(e) => setType(e.target.value as MeterType)}
                className="w-auto"
              >
                {types.map((m) => (
                  <option key={m} value={m}>
                    {t(`types.${m}`)}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <p className="text-sm font-medium">{t(`types.${activeType}`)}</p>
            )}
            <ConsumptionChart assetId={asset.id} meterType={activeType} />
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                {t('readings')} ({list.length})
              </summary>
              <ul className="mt-2 grid gap-1 text-sm">
                {list.map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-muted">{fmt.date(r.readAt)}</span>
                    <span className="flex-1 tabular-nums">
                      {number(r.value)} {r.unit}
                      {r.note ? <span className="text-muted"> · {r.note}</span> : null}
                    </span>
                    {canWrite ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${tc('delete')}: ${fmt.date(r.readAt)}`}
                        onClick={() => setDeleting(r.id)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </CardContent>
      <ReadingDialog
        open={adding}
        onOpenChange={setAdding}
        asset={asset}
        defaultType={activeType ?? defaultMeter(asset.kind)}
        lastUnit={(type: MeterType) =>
          readings.data?.find((r) => r.meterType === type)?.unit ?? DEFAULT_UNIT[type]
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('deleteTitle')}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </Card>
  );
}

function ConsumptionChart({ assetId, meterType }: { assetId: string; meterType: MeterType }) {
  const t = useTranslations('homeAssets.meters');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const [period, setPeriod] = React.useState<'month' | 'year'>('month');
  const query = useQuery({
    queryKey: ['home', 'meters.consumption', householdId, assetId, meterType, period],
    queryFn: () =>
      api.home.meters.consumption({
        params: { householdId, assetId },
        query: { meterType, period },
      }),
  });
  const number = (v: string | number) =>
    new Intl.NumberFormat(fmt.intlLocale, { maximumFractionDigits: 2 }).format(Number(v));

  if (query.isPending) return <LoadingState rows={2} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const stats = query.data;
  const unit = stats.unit ?? '';
  if (stats.periods.length === 0) return <p className="text-sm text-muted">{t('notEnough')}</p>;
  const periodLabel = (p: string) =>
    /^\d{4}-\d{2}$/.test(p) ? fmt.date(`${p}-15`, { month: 'short', year: '2-digit' }) : p;
  const data = stats.periods.map((p) => ({
    label: periodLabel(p.period),
    value: Number(p.consumption),
  }));

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">{t('consumption')}</span>
        <NativeSelect
          aria-label={t('period')}
          value={period}
          onChange={(e) => setPeriod(e.target.value as 'month' | 'year')}
          className="h-8 w-auto"
        >
          <option value="month">{t('perMonth')}</option>
          <option value="year">{t('perYear')}</option>
        </NativeSelect>
        <span className="text-muted">
          {t('total', { value: `${number(stats.total)} ${unit}` })}
        </span>
        {stats.avgPerDay ? (
          <span className="text-muted">
            {t('avgPerDay', { value: `${number(stats.avgPerDay)} ${unit}` })}
          </span>
        ) : null}
      </div>
      <figure
        className="h-56"
        aria-label={t('chartLabel', {
          type: t(`types.${meterType}`),
          period: period === 'month' ? t('perMonth') : t('perYear'),
        })}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ fill: 'var(--color-surface-muted)' }}
              contentStyle={{
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                color: 'var(--color-foreground)',
              }}
              formatter={(value) => [`${number(Number(value))} ${unit}`, t('consumption')]}
            />
            <Bar dataKey="value" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </figure>
      <table className="sr-only">
        <caption>{t('consumption')}</caption>
        <tbody>
          {stats.periods.map((p) => (
            <tr key={p.period}>
              <th scope="row">{periodLabel(p.period)}</th>
              <td>
                {number(p.consumption)} {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ReadingForm {
  meterType: MeterType;
  value: string;
  unit: string;
  readAt: string;
  note: string;
}

function localDateTimeNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function ReadingDialog({
  open,
  onOpenChange,
  asset,
  defaultType,
  lastUnit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: HomeAsset;
  defaultType: MeterType;
  lastUnit: (type: MeterType) => string;
}) {
  const t = useTranslations('homeAssets.meters');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const { register, handleSubmit, reset, setError, setValue, formState } = useForm<ReadingForm>();
  React.useEffect(() => {
    if (open)
      reset({
        meterType: defaultType,
        value: '',
        unit: lastUnit(defaultType),
        readAt: localDateTimeNow(),
        note: '',
      });
    // lastUnit is derived from query data; only reset when opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset, defaultType]);

  const mutation = useMutation({
    mutationFn: (v: ReadingForm) =>
      api.home.meters.create({
        params: { householdId, assetId: asset.id },
        body: {
          meterType: v.meterType,
          value: v.value.trim().replace(',', '.'),
          unit: v.unit.trim(),
          readAt: new Date(v.readAt).toISOString(),
          note: v.note.trim() || null,
        },
      }),
    onSuccess: async () => {
      toast.success(t('saved'));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['home'] });
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('add')}</DialogTitle>
          <DialogDescription>{asset.name}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => void handleSubmit((v) => mutation.mutate(v))(e)}
          className="grid gap-4"
          noValidate
        >
          <Field label={t('type')}>
            {(p) => (
              <NativeSelect
                {...p}
                {...register('meterType', {
                  onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                    setValue('unit', lastUnit(e.target.value as MeterType)),
                })}
              >
                {METER_TYPES.map((m) => (
                  <option key={m} value={m}>
                    {t(`types.${m}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <div className="grid grid-cols-[2fr_1fr] gap-4">
            <Field label={t('value')} hint={t('valueHint')} error={formState.errors.value?.message}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  className="text-right tabular-nums"
                  {...register('value', {
                    required: tu('required'),
                    validate: (v) => /^\d{1,12}([.,]\d{1,3})?$/.test(v.trim()) || t('invalidValue'),
                  })}
                />
              )}
            </Field>
            <Field label={t('unit')} error={formState.errors.unit?.message}>
              {(p) => <Input {...p} {...register('unit', { required: tu('required') })} />}
            </Field>
          </div>
          <Field label={t('readAt')}>
            {(p) => (
              <Input {...p} type="datetime-local" {...register('readAt', { required: true })} />
            )}
          </Field>
          <Field label={t('note')}>{(p) => <Input {...p} {...register('note')} />}</Field>
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
