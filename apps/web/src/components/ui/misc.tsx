'use client';

import { Progress as ProgressPrimitive, Separator as SeparatorPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-surface-muted', className)}
      {...props}
    />
  );
}

export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}

const indicatorTone = {
  default: 'bg-primary',
  ok: 'bg-success',
  warning: 'bg-warning',
  exceeded: 'bg-danger',
} as const;

export function Progress({
  className,
  value,
  tone = 'default',
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { tone?: keyof typeof indicatorTone }) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <ProgressPrimitive.Root
      value={pct}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-surface-muted', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn('h-full transition-all', indicatorTone[tone])}
        style={{ width: `${pct}%` }}
      />
    </ProgressPrimitive.Root>
  );
}
