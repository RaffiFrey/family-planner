'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from './label';

export interface FieldControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
}

interface FieldProps {
  label: React.ReactNode;
  error?: string | undefined;
  hint?: React.ReactNode;
  className?: string;
  /** Render prop receives the props that wire up `id`, `aria-invalid` and `aria-describedby`. */
  children: (control: FieldControlProps) => React.ReactNode;
}

/** Label + control + error/hint with correct ARIA wiring. */
export function Field({ label, error, hint, className, children }: FieldProps) {
  const id = React.useId();
  const describedBy =
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
