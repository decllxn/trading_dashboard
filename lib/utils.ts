import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional class names with Tailwind-aware de-duplication.
 * Used by every shadcn/ui component and any component that composes
 * Tailwind classes conditionally.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
