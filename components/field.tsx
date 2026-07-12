import {
  forwardRef,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Label = forwardRef<
  HTMLLabelElement,
  LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      'text-tertiary block text-xs uppercase tracking-wide',
      className,
    )}
    {...props}
  />
));
Label.displayName = 'Label';

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'num w-full rounded-card border border-hairline bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-accent-signal focus:outline-none focus:ring-1 focus:ring-accent-signal',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

/**
 * Select — a styled native <select>. `appearance-none` strips the native
 * chrome (which clashes with the instrument-panel look); a lucide chevron
 * fills the affordance back in. Default styling is sans-serif (the typical
 * case — labels like "Equity", "Closed"); opt into mono with className="num"
 * for the rare select whose options are numeric.
 */
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        'w-full appearance-none rounded-card border border-hairline bg-surface py-2 pl-3 pr-9 text-sm text-primary focus:border-accent-signal focus:outline-none focus:ring-1 focus:ring-accent-signal',
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      size={14}
      strokeWidth={1.75}
      className="text-tertiary pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
      aria-hidden="true"
    />
  </div>
));
Select.displayName = 'Select';

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}

/** Label + control + error text, stacked. */
export function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-loss text-xs">{error}</p>
      ) : null}
    </div>
  );
}
