import { type ReactNode } from 'react';
import { redirect } from 'next/navigation';
import {
  createServerClient,
  isSupabaseConfigured,
} from '@/lib/supabase';
import { NavRail } from '@/components/shell/nav-rail';
import { TopBar } from '@/components/shell/top-bar';
import { SignalStrip } from '@/components/shell/signal-strip';
import { CopilotProvider } from '@/components/copilot/copilot-provider';

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

  // Fetch broker connection
  const { data: connection } = await supabase
    .from('broker_connections')
    .select('broker_name, provider')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const activeBrokerName = connection
    ? (connection.broker_name || connection.provider)
    : null;

  // Calculate starting balance and current net equity for rank progression
  const { db } = await import('@/db');
  const { trades, userSettings } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const { computeNetPnl, STARTING_BALANCE_DEFAULT } = await import('@/lib/stats');

  let startingBalance = STARTING_BALANCE_DEFAULT;
  let currentBalance = STARTING_BALANCE_DEFAULT;

  let totalClosedNetPnl = 0;
  const pnlPoints: Array<{ time: string; value: number }> = [];

  if (db) {
    const settingsRow = await db
      .select({ startingBalance: userSettings.startingBalance })
      .from(userSettings)
      .where(eq(userSettings.userId, user.id))
      .limit(1)
      .then((rows) => rows[0]);

    startingBalance = settingsRow?.startingBalance
      ? Number(settingsRow.startingBalance)
      : STARTING_BALANCE_DEFAULT;

    const tradesRows = await db
      .select({
        pnl: trades.pnl,
        commission: trades.commission,
        swap: trades.swap,
        fees: trades.fees,
        status: trades.status,
        exitTime: trades.exitTime,
        entryTime: trades.entryTime,
      })
      .from(trades)
      .where(eq(trades.userId, user.id));

    // Sort closed trades chronologically to build equity series
    const closedTrades = tradesRows
      .filter((t) => t.status === 'closed')
      .sort((a, b) => {
        const dateA = a.exitTime ? new Date(a.exitTime).getTime() : a.entryTime ? new Date(a.entryTime).getTime() : 0;
        const dateB = b.exitTime ? new Date(b.exitTime).getTime() : b.entryTime ? new Date(b.entryTime).getTime() : 0;
        return dateA - dateB;
      });

    let runningEquity = startingBalance;
    pnlPoints.push({ time: 'Start', value: runningEquity });

    for (const t of closedTrades) {
      const gross = t.pnl ? Number(t.pnl) : 0;
      const commission = t.commission ? Number(t.commission) : 0;
      const swap = t.swap ? Number(t.swap) : 0;
      const fees = t.fees ? Number(t.fees) : 0;
      const netPnl = computeNetPnl(gross, commission, swap, fees);
      if (netPnl !== null) {
        totalClosedNetPnl += netPnl;
        runningEquity += netPnl;
        const timeVal = t.exitTime || t.entryTime;
        const timeStr = timeVal ? new Date(timeVal).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        pnlPoints.push({ time: timeStr, value: runningEquity });
      }
    }

    currentBalance = startingBalance + totalClosedNetPnl;
  }

  // Persistent app shell: rail + (top bar + signal strip + content).
  return (
    <CopilotProvider>
      <div className="bg-base flex h-[100dvh] w-full overflow-hidden">
        <NavRail />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="z-30 shrink-0">
            <TopBar 
              email={user.email ?? ''} 
              activeBrokerName={activeBrokerName} 
              currentBalance={currentBalance}
            />
            <SignalStrip 
              startingBalance={startingBalance}
              currentBalance={currentBalance}
              pnlPoints={pnlPoints}
            />
          </div>
          <main className="no-scrollbar min-w-0 flex-1 overflow-y-auto pb-16 md:pb-0">{children}</main>
        </div>
      </div>
    </CopilotProvider>
  );
}


