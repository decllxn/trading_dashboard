import { redirect } from 'next/navigation';
import {
  createServerClient,
  isSupabaseConfigured,
} from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (!isSupabaseConfigured()) {
    redirect('/login');
  }

  const supabase = createServerClient();
  if (!supabase) {
    redirect('/login');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? '/dashboard' : '/login');
}
