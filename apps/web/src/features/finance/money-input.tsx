'use client';

import type { CurrencyCode } from '@fp/domain/money';
import type * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Text input for money. The value stays a string while typing; callers parse it to
 * integer minor units with `useFormat().parseMoney` on submit (never floats).
 */
export function MoneyInput({
  currency,
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type'> & { currency: CurrencyCode }) {
  return (
    <div className={cn('relative', className)}>
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="pr-14 text-right tabular-nums"
        {...props}
      />
      <span
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted"
        aria-hidden
      >
        {currency}
      </span>
    </div>
  );
}
