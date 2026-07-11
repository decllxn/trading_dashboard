'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';

export interface AuthState {
  error?: string;
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

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    return { error: error.message };
  }

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
