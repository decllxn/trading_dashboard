import { type ReactNode } from 'react';
import { redirect } from 'next/navigation';
import {
  createServerClient,
  isSupabaseConfigured,
} from '@/lib/supabase';
import { NavRail } from '@/components/shell/nav-rail';
import { TopBar } from '@/components/shell/top-bar';

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

  // Persistent app shell: rail + (top bar + content).
  // The frame persists across all /dashboard/* navigation; only {children}
  // re-renders on route change.
  //
  // The shell is height-locked (h-screen overflow-hidden) so the NavRail and
  // TopBar never scroll — only the <main> scroll container does. min-w-0 on
  // the columns keeps flex children from pushing the rail when wide tables or
  // charts overflow. z-40/z-30 establish the persistent layers so floating UI
  // (tooltips, the account menu) always paint above scrolling content.
  return (
    <div className="bg-base flex h-screen overflow-hidden">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="z-30 shrink-0">
          <TopBar email={user.email ?? ''} />
        </div>
        <main className="no-scrollbar min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
