import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantClasses: Record<Variant, string> = {
  // Primary action: accent-signal fill, dark text — used sparingly per DS.
  primary:
    'bg-accent-signal text-base hover:bg-accent-signal/90 focus-visible:outline-accent-signal',
  // Ghost: quiet text, no fill — for secondary links/cancel.
  ghost:
    'text-secondary hover:text-primary focus-visible:outline-accent-signal',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center rounded-card px-4 py-2 text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
          variantClasses[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
