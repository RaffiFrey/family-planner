'use client';

import { toIntlLocale } from '@fp/i18n';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  buildRRule,
  DEFAULT_RECURRENCE,
  type Frequency,
  FREQUENCIES,
  parseRRule,
  type RecurrenceValue,
  type Weekday,
  WEEKDAYS,
  weekdayOf,
} from './rrule';

interface RecurrencePickerProps {
  /** RRULE string or null for "does not repeat". */
  value: string | null;
  onChange: (rrule: string | null) => void;
  /** Used to preselect the weekday when switching to weekly. */
  start?: Date;
  /** Hide the "does not repeat" option (e.g. when the parent controls that). */
  required?: boolean;
  className?: string;
}

const FREQ_KEY = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const;

export function RecurrencePicker({
  value,
  onChange,
  start,
  required = false,
  className,
}: RecurrencePickerProps) {
  const t = useTranslations('ui.recurrence');
  const tr = useTranslations('recurrence');
  const locale = useLocale();
  const id = React.useId();
  const parsed = parseRRule(value);
  const current: RecurrenceValue | null = parsed ?? (required ? DEFAULT_RECURRENCE : null);

  const weekdayNames = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat(toIntlLocale(locale), { weekday: 'short' });
    // 2024-01-01 was a Monday.
    return WEEKDAYS.map((_, i) => fmt.format(new Date(2024, 0, 1 + i)));
  }, [locale]);

  const update = (patch: Partial<RecurrenceValue>) => {
    onChange(buildRRule({ ...(current ?? DEFAULT_RECURRENCE), ...patch }));
  };

  const onFreqChange = (freq: string) => {
    if (freq === 'none') {
      onChange(null);
      return;
    }
    const f = freq as Frequency;
    const byDay: Weekday[] =
      f === 'WEEKLY'
        ? current?.byDay.length
          ? current.byDay
          : [weekdayOf(start ?? new Date())]
        : [];
    onChange(buildRRule({ ...(current ?? DEFAULT_RECURRENCE), freq: f, byDay }));
  };

  const toggleDay = (d: Weekday) => {
    if (!current) return;
    const next = current.byDay.includes(d)
      ? current.byDay.filter((x) => x !== d)
      : [...current.byDay, d];
    update({ byDay: next.length ? next : [d] });
  };

  return (
    <fieldset className={cn('grid gap-3', className)}>
      <legend className="sr-only">{t('label')}</legend>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-freq`}>{t('label')}</Label>
        <NativeSelect
          id={`${id}-freq`}
          value={current?.freq ?? 'none'}
          onChange={(e) => onFreqChange(e.target.value)}
        >
          {required ? null : <option value="none">{tr('none')}</option>}
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {tr(FREQ_KEY[f])}
            </option>
          ))}
        </NativeSelect>
      </div>

      {current ? (
        <>
          <div className="flex items-center gap-2">
            <Label htmlFor={`${id}-interval`} className="shrink-0">
              {t('every')}
            </Label>
            <Input
              id={`${id}-interval`}
              type="number"
              min={1}
              max={999}
              className="w-20"
              value={current.interval}
              onChange={(e) => update({ interval: Math.max(1, Number(e.target.value) || 1) })}
            />
            <span className="text-sm text-muted">
              {t(`unit.${current.freq}`, { count: current.interval })}
            </span>
          </div>

          {current.freq === 'WEEKLY' ? (
            <div className="grid gap-1.5">
              <span className="text-sm font-medium" id={`${id}-days`}>
                {t('onDays')}
              </span>
              <div className="flex flex-wrap gap-1" role="group" aria-labelledby={`${id}-days`}>
                {WEEKDAYS.map((d, i) => {
                  const active = current.byDay.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleDay(d)}
                      className={cn(
                        'h-9 min-w-10 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background hover:bg-surface-muted',
                      )}
                    >
                      {weekdayNames[i]}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="grid gap-2">
            <span className="text-sm font-medium">{t('ends')}</span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${id}-end`}
                  className="accent-(--fp-primary)"
                  checked={current.end.type === 'never'}
                  onChange={() => update({ end: { type: 'never' } })}
                />
                {t('never')}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${id}-end`}
                  className="accent-(--fp-primary)"
                  checked={current.end.type === 'until'}
                  onChange={() =>
                    update({
                      end: {
                        type: 'until',
                        date: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
                      },
                    })
                  }
                />
                {t('until')}
              </label>
              {current.end.type === 'until' ? (
                <Input
                  type="date"
                  aria-label={t('untilDate')}
                  className="w-auto"
                  value={current.end.date}
                  onChange={(e) =>
                    e.target.value && update({ end: { type: 'until', date: e.target.value } })
                  }
                />
              ) : null}
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${id}-end`}
                  className="accent-(--fp-primary)"
                  checked={current.end.type === 'count'}
                  onChange={() => update({ end: { type: 'count', count: 10 } })}
                />
                {t('after')}
              </label>
              {current.end.type === 'count' ? (
                <span className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={999}
                    aria-label={t('countLabel')}
                    className="w-20"
                    value={current.end.count}
                    onChange={(e) =>
                      update({
                        end: { type: 'count', count: Math.max(1, Number(e.target.value) || 1) },
                      })
                    }
                  />
                  {t('times')}
                </span>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </fieldset>
  );
}
