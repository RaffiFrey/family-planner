'use client';

import { CheckIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { COLOR_PRESETS, cn, readableTextColor } from '@/lib/utils';

export function ColorPicker({
  value,
  onChange,
  label,
  className,
}: {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  className?: string;
}) {
  const t = useTranslations('ui');
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', className)}
      role="radiogroup"
      aria-label={label ?? t('color')}
    >
      {COLOR_PRESETS.map((c) => {
        const active = value.toLowerCase() === c;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={c}
            onClick={() => onChange(c)}
            className="inline-flex size-8 items-center justify-center rounded-full outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-primary"
            style={{ backgroundColor: c, color: readableTextColor(c) }}
          >
            {active ? <CheckIcon className="size-4" aria-hidden /> : null}
          </button>
        );
      })}
      <label className="inline-flex items-center gap-2 text-sm text-muted">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-8 cursor-pointer rounded-full border border-border bg-transparent"
          aria-label={t('customColor')}
        />
      </label>
    </div>
  );
}
