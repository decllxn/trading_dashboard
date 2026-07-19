'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Segmented control — a row of mutually-exclusive options rendered as a single
 * hairline-bordered track with a sliding accent on the active segment.
 *
 * Implemented with native radios so it submits its value in the FormData (no
 * hidden input syncing needed) and is fully keyboard-accessible. The radios
 * are visually hidden but focusable; the visible segment is a <label> wrapping
 * each radio.
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedProps<T extends string> {
  /** Form field name — submitted with the selected value. */
  name: string;
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible label for the group. Required — always label a radio group. */
  'aria-label': string;
}

export function Segmented<T extends string>({
  name,
  options,
  value,
  onChange,
  ...rest
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      className="border-hairline bg-surface flex rounded-card border"
      {...rest}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <label
            key={opt.value}
            className={cn(
              'flex flex-1 cursor-pointer items-center justify-center px-3 py-2 text-sm transition-colors duration-150',
              i > 0 ? 'border-hairline border-l' : null,
              active
                ? 'text-accent-signal bg-surface-raised'
                : 'text-secondary hover:text-primary',
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={active}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}
