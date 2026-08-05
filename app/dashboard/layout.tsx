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
  const { trades, userSettings, capitalTransactions } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const { computeNetPnl, STARTING_BALANCE_DEFAULT, computeNetCapitalCashflow, accountEquitySeries } = await import('@/lib/stats');

  let startingBalance = STARTING_BALANCE_DEFAULT;
  let currentBalance = STARTING_BALANCE_DEFAULT;

  let totalClosedNetPnl = 0;
  let netCashflow = 0;
  let pnlPoints: Array<{ time: string; value: number }> = [];

  let highestAchievedLevel = 0;

  if (db) {
    const settingsRow = await db
      .select({
        startingBalance: userSettings.startingBalance,
        highestAchievedLevel: userSettings.highestAchievedLevel,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, user.id))
      .limit(1)
      .then((rows) => rows[0]);

    startingBalance = settingsRow?.startingBalance
      ? Number(settingsRow.startingBalance)
      : STARTING_BALANCE_DEFAULT;
    highestAchievedLevel = settingsRow?.highestAchievedLevel ?? 0;

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

    let txRows: any[] = [];
    try {
      txRows = await db
        .select({
          id: capitalTransactions.id,
          type: capitalTransactions.type,
          amount: capitalTransactions.amount,
          date: capitalTransactions.date,
          brokerName: capitalTransactions.brokerName,
          note: capitalTransactions.note,
        })
        .from(capitalTransactions)
        .where(eq(capitalTransactions.userId, user.id));
    } catch (err) {
      console.warn('capital_transactions table query failed:', err);
    }

    const statTx = txRows.map((t) => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      date: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
      brokerName: t.brokerName,
      note: t.note,
    }));

    netCashflow = computeNetCapitalCashflow(statTx);

    const statTrades = tradesRows.map((t) => ({
      pnl: computeNetPnl(
        t.pnl ? Number(t.pnl) : null,
        t.commission ? Number(t.commission) : null,
        t.swap ? Number(t.swap) : null,
        t.fees ? Number(t.fees) : null,
      ),
      status: t.status,
      entryTime: t.entryTime ? new Date(t.entryTime).toISOString() : null,
      exitTime: t.exitTime ? new Date(t.exitTime).toISOString() : null,
    }));

    for (const st of statTrades) {
      if (st.status === 'closed' && st.pnl != null) {
        totalClosedNetPnl += st.pnl;
      }
    }

    const eqPoints = accountEquitySeries(statTrades, startingBalance, statTx);
    pnlPoints = [{ time: 'Start', value: startingBalance }, ...eqPoints.map((p) => ({ time: p.time, value: p.value }))];
    currentBalance = startingBalance + netCashflow + totalClosedNetPnl;

    const { computePeakLevelFromEquity } = await import('@/lib/levels');
    const peakHistLevel = computePeakLevelFromEquity(eqPoints, startingBalance);
    if (peakHistLevel > highestAchievedLevel) {
      highestAchievedLevel = peakHistLevel;
      try {
        await db
          .insert(userSettings)
          .values({
            userId: user.id,
            highestAchievedLevel: peakHistLevel,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: userSettings.userId,
            set: {
              highestAchievedLevel: peakHistLevel,
              updatedAt: new Date(),
            },
          });
      } catch (err) {
        console.warn('Failed to update highestAchievedLevel in layout:', err);
      }
    }
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
              highestAchievedLevel={highestAchievedLevel}
            />
            <SignalStrip 
              startingBalance={startingBalance}
              currentBalance={currentBalance}
              pnlPoints={pnlPoints}
            />
          </div>
          <main className="no-scrollbar min-w-0 flex-1 overflow-y-auto pb-20 md:pb-0">{children}</main>
        </div>
      </div>
    </CopilotProvider>
  );
}


