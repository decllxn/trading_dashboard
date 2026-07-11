'use client';

import { useFormState } from 'react-dom';
import { Field, Input } from '@/components/field';
import { SubmitButton } from '@/components/submit-button';
import { signIn, type AuthState } from '@/app/(auth)/actions';

export function LoginForm() {
  const [state, formAction] = useFormState<AuthState, FormData>(signIn, {});

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
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </Field>
      <SubmitButton pendingLabel="Authenticating…" className="w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}
