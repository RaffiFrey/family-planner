import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-danger text-white hover:bg-danger/90',
        outline: 'border border-border bg-background hover:bg-surface-muted',
        secondary: 'bg-surface-muted text-foreground hover:bg-surface-muted/70',
        ghost: 'hover:bg-surface-muted',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3',
        sm: 'h-7 px-2 text-xs',
        lg: 'h-10 px-4',
        icon: 'size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  if (asChild)
    return <Slot.Root className={cn(buttonVariants({ variant, size, className }))} {...props} />;
  return (
    <button
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
