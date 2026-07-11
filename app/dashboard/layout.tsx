import { type ReactNode } from 'react';
import { redirect } from 'next/navigation';
import {
  createServerClient,
  isSupabaseConfigured,
} from '@/lib/supabase';
import { NavRail } from '@/components/shell/nav-rail';
import { TopBar } from '@/components/shell/top-bar';
import { SignalStrip } from '@/components/shell/signal-strip';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <main className="bg-base flex min-h-screen items-center justify-center px-unit">
        <div className="border-hairline bg-surface w-full max-w-md rounded-card p-8">
          <h1 className="font-display text-primary text-lg">
            Dashboard unavailable
          </h1>
          <p className="text-secondary mt-2 text-sm">
            Supabase is not configured. Add credentials to{' '}
            <code className="num text-accent-signal">.env.local</code> to enable
            auth.
          </p>
        </div>
      </main>
    );
  }

  const supabase = createServerClient();
  if (!supabase) {
    redirect('/login');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Persistent app shell: rail + (top bar + signal strip + content).
  // The frame persists across all /dashboard/* navigation; only {children}
  // re-renders on route change.
  return (
    <div className="bg-base flex min-h-screen">
      <NavRail />
      <div className="flex flex-1 flex-col">
        <TopBar email={user.email ?? ''} />
        <SignalStrip />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
