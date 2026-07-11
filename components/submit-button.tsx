'use client';

import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from '@/components/button';

/**
 * Submit button that reflects the pending state of its parent <form>.
 * useFormStatus must be read from a component rendered inside the form.
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ButtonProps & { pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
