import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { Slot } from 'radix-ui';

const badgeVariants = cva(
  'inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-xs border border-transparent px-2 text-[11px] font-bold whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary-soft text-primary [a&]:hover:bg-primary-soft/80',
        secondary: 'bg-secondary text-foreground [a&]:hover:bg-secondary/80',
        muted: 'bg-secondary text-muted-foreground',
        warning: 'bg-warning-soft text-warning-foreground',
        destructive: 'border-destructive bg-transparent text-destructive',
        outline:
          'border-input text-muted-foreground [a&]:hover:bg-secondary [a&]:hover:text-foreground',
        ghost: '[a&]:hover:bg-secondary [a&]:hover:text-foreground',
        link: 'text-primary underline-offset-4 [a&]:hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
