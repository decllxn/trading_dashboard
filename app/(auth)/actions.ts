'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';

export interface AuthState {
  error?: string;
  /** Info/success message (e.g. "check your email"). Mutually exclusive with error. */
  message?: string;
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured()) {
    return { error: 'Supabase is not configured.' };
  }
  const supabase = createServerClient();
  if (!supabase) {
    return { error: 'Supabase client unavailable.' };
  }

  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  // signInWithPassword always yields a session on success or errors otherwise
  // (e.g. "Email not confirmed" when confirmation is required). No session
  // check needed here — an unconfirmed sign-in surfaces as an error.
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  redirect('/dashboard');
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured()) {
    return { error: 'Supabase is not configured.' };
  }
  const supabase = createServerClient();
  if (!supabase) {
    return { error: 'Supabase client unavailable.' };
  }

  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    return { error: error.message };
  }

  // Email confirmation enabled (Supabase default): signUp() succeeds but
  // establishes NO session. Redirecting to /dashboard here would bounce back
  // to /login via middleware (no session cookie). Show a confirm-email notice
  // instead and let the user sign in after confirming.
  if (!data.session) {
    return { message: 'Check your email to confirm your account.' };
  }

  // Email confirmation disabled: session is live, go straight in.
  revalidatePath('/dashboard');
  redirect('/dashboard');
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = createServerClient();
  if (!supabase) return;

  await supabase.auth.signOut();
  revalidatePath('/login');
  redirect('/login');
}
