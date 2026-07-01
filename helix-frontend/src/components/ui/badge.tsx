import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        file: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
        function: 'bg-green-500/15 text-green-400 border border-green-500/20',
        class: 'bg-purple-500/15 text-purple-400 border border-purple-500/20',
        module: 'bg-orange-500/15 text-orange-400 border border-orange-500/20',
        default: 'bg-zinc-800 text-zinc-400 border border-zinc-700',
        success: 'bg-green-500/15 text-green-400',
        warning: 'bg-yellow-500/15 text-yellow-400',
        error: 'bg-red-500/15 text-red-400',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };