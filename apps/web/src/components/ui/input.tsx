import type * as React from 'react';
import { cn } from '@/lib/utils';

export const inputClass =
  'flex h-10 w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger file:border-0 file:bg-transparent file:text-sm file:font-medium';

export function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return <input type={type} className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(inputClass, 'h-auto min-h-20 resize-y', className)} {...props} />;
}

/** Native select: best for long option lists and on mobile; styled like Input. */
export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return <select className={cn(inputClass, 'pr-8', className)} {...props} />;
}
