import { type ReactNode } from 'react';
import { isSupabaseConfigured } from '@/lib/supabase';

export default function AuthLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) {
    return (
      <main className="bg-base flex min-h-screen items-center justify-center px-unit">
        <div className="border-hairline bg-surface w-full max-w-md rounded-card p-8">
          <h1 className="font-display text-primary text-lg">
            Auth unavailable
          </h1>
          <p className="text-secondary mt-2 text-sm">
            Supabase is not configured. Add credentials to{' '}
            <code className="num text-accent-signal">.env.local</code> to enable
            sign in and sign up.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-base flex min-h-screen flex-row">
      {/* Console rail — mono system readouts, instrument-panel feel. */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-hairline px-6 py-8 md:flex">
        <div className="space-y-1">
          <p className="font-display text-primary text-sm">
            Trading Dashboard
          </p>
          <p className="num text-tertiary text-xs">v0.1.0 · build #14</p>
        </div>
        <div className="space-y-1">
          <p className="num text-tertiary text-xs uppercase tracking-wide">
            Status
          </p>
          <p className="num text-secondary text-xs">
            <span className="text-accent-signal">●</span> ONLINE
          </p>
          <p className="num text-tertiary text-xs">NODE · us-east</p>
        </div>
      </aside>
      {/* Form area — left-aligned, no enclosing card. */}
      <div className="flex flex-1 items-center px-6 py-16 md:px-16">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </main>
  );
}
