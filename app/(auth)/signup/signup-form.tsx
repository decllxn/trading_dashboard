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
      {state.message ? (
        <p className="border-accent-alert/40 text-accent-alert rounded-card border bg-surface px-3 py-2 text-xs">
          {state.message}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Creating account…" className="w-full">
        Create account
      </SubmitButton>
    </form>
  );
}
