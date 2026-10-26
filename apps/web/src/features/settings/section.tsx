import type * as React from 'react';
import { cn } from '@/lib/utils';

/** Titled block inside a settings page; h2 because the settings layout owns the h1. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  tone = 'default',
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <section
      className={cn(
        'rounded-lg border bg-surface p-4 sm:p-5',
        tone === 'danger' ? 'border-danger/40' : 'border-border',
        className,
      )}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={cn('text-base font-semibold', tone === 'danger' && 'text-danger')}>
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** ISO instant to the value format of `<input type="datetime-local">` in the browser's zone. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
