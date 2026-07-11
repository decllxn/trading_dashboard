'use client';

import { useFormState } from 'react-dom';
import { Field, Input } from '@/components/field';
import { SubmitButton } from '@/components/submit-button';
import { signUp, type AuthState } from '@/app/(auth)/actions';

export function SignupForm() {
  const [state, formAction] = useFormState<AuthState, FormData>(signUp, {});

  return (
    <form action={formAction} className="space-y-4">
      <Field id="email" label="Email" error={state.error}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </Field>
      <Field id="password" label="Password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="••••••••"
        />
      </Field>
      <SubmitButton pendingLabel="Creating account…" className="w-full">
        Create account
      </SubmitButton>
    </form>
  );
}
