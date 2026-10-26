import * as React from 'react';
import { cn } from '@/lib/utils';

export const fieldClass =
  'w-full rounded-sm border border-border bg-background px-2.5 text-sm text-foreground placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger';

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(fieldClass, 'h-8', className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldClass, 'min-h-20 py-1.5', className)} {...props} />;
}

/** Native select: dense, accessible and keyboard-friendly without extra JS. */
export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return <select className={cn(fieldClass, 'h-8 pr-7', className)} {...props} />;
}
