import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase';
import { db } from '@/db';
import { capitalTransactions, trades, userSettings } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { decryptText } from '@/lib/crypto';
import {
  computeNetPnl,
  computeTotalDeposits,
  computeTotalWithdrawals,
  computeNetCapitalCashflow,
  resolveStartingBalance,
  STARTING_BALANCE_DEFAULT,
  type StatCapitalTransaction,
} from '@/lib/stats';
import { AddTransactionModal } from '@/components/capital/add-transaction-modal';
import { TransactionList } from '@/components/capital/transaction-list';
import { ArrowDownRight, ArrowUpRight, DollarSign, Wallet, PiggyBank, Scale } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function CapitalPage() {
  const supabase = createServerClient();
  if (!supabase) redirect('/login');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: activeAcctRow } = await supabase
    .from('trading_accounts')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();
  const activeAccountId = activeAcctRow?.id ?? null;

  let startingBalance = STARTING_BALANCE_DEFAULT;
  let rawTransactions: StatCapitalTransaction[] = [];
  let totalTradingNetPnl = 0;

  if (db) {
    const settingsRow = await db
      .select({ startingBalance: userSettings.startingBalance })
      .from(userSettings)
      .where(eq(userSettings.userId, user.id))
      .limit(1)
      .then((rows) => rows[0]);

    startingBalance = resolveStartingBalance(settingsRow?.startingBalance ?? null);

    let txRows: any[] = [];
    try {
      const condition = activeAccountId 
        ? and(eq(capitalTransactions.userId, user.id), eq(capitalTransactions.tradingAccountId, activeAccountId))
        : eq(capitalTransactions.userId, user.id);

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
        .where(condition)
        .orderBy(capitalTransactions.date);
    } catch (err) {
      console.warn('capital/page query failed:', err);
    }

    rawTransactions = txRows.map((t) => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      date: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
      brokerName: decryptText(t.brokerName, user.id),
      note: decryptText(t.note, user.id),
    }));

    const tradesCondition = activeAccountId
      ? and(eq(trades.userId, user.id), eq(trades.tradingAccountId, activeAccountId))
      : eq(trades.userId, user.id);

    const tradeRows = await db
      .select({
        pnl: trades.pnl,
        commission: trades.commission,
        swap: trades.swap,
        fees: trades.fees,
        status: trades.status,
      })
      .from(trades)
      .where(tradesCondition);

    for (const tr of tradeRows) {
      if (tr.status === 'closed' && tr.pnl != null) {
        const net = computeNetPnl(
          Number(tr.pnl),
          tr.commission ? Number(tr.commission) : null,
          tr.swap ? Number(tr.swap) : null,
          tr.fees ? Number(tr.fees) : null,
        );
        if (net != null) totalTradingNetPnl += net;
      }
    }
  } else {
    const { data: settingsRow } = await supabase
      .from('user_settings')
      .select('starting_balance')
      .eq('user_id', user.id)
      .maybeSingle();

    startingBalance = resolveStartingBalance(settingsRow?.starting_balance ?? null);

    let txsQuery = supabase
      .from('capital_transactions')
      .select('id, type, amount, date, broker_name, note')
      .eq('user_id', user.id);
      
    if (activeAccountId) {
      txsQuery = txsQuery.eq('trading_account_id', activeAccountId);
    }

    const { data: txs } = await txsQuery.order('date', { ascending: false });

    rawTransactions = (txs || []).map((t: any) => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      date: t.date,
      brokerName: decryptText(t.broker_name, user.id),
      note: decryptText(t.note, user.id),
    }));

    let tradesQuery = supabase
      .from('trades')
      .select('pnl, commission, swap, fees, status')
      .eq('user_id', user.id)
      .eq('status', 'closed');
      
    if (activeAccountId) {
      tradesQuery = tradesQuery.eq('trading_account_id', activeAccountId);
    }

    const { data: rawTrades } = await tradesQuery;

    for (const tr of rawTrades || []) {
      if (tr.pnl != null) {
        const net = computeNetPnl(
          Number(tr.pnl),
          tr.commission ? Number(tr.commission) : null,
          tr.swap ? Number(tr.swap) : null,
          tr.fees ? Number(tr.fees) : null,
        );
        if (net != null) totalTradingNetPnl += net;
      }
    }
  }

  const totalDeposits = computeTotalDeposits(rawTransactions);
  const totalWithdrawals = computeTotalWithdrawals(rawTransactions);
  const netCashflow = computeNetCapitalCashflow(rawTransactions);
  const currentBalance = startingBalance + netCashflow + totalTradingNetPnl;

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 border-b border-hairline pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-tertiary font-mono">
            Account Management
          </p>
          <h1 className="mt-1 font-display text-2xl text-primary flex items-center gap-2">
            <Wallet className="text-accent-signal" size={26} />
            Capital & Cash Flows
          </h1>
          <p className="text-xs text-secondary mt-1">
            Log deposits, record broker withdrawals, and monitor your total account balance.
          </p>
        </div>
        <div>
          <AddTransactionModal />
        </div>
      </header>

      {/* KPI Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Account Balance */}
        <div className="rounded-card border border-hairline bg-surface p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-tertiary text-xs">
            <span>Current Balance</span>
            <Wallet size={16} className="text-accent-signal" />
          </div>
          <div className="mt-3">
            <p className="font-mono text-2xl font-bold text-primary">
              ${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-secondary mt-1">
              Starting + Cashflow + P&L
            </p>
          </div>
        </div>

        {/* Total Deposited */}
        <div className="rounded-card border border-hairline bg-surface p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-tertiary text-xs">
            <span>Total Deposited</span>
            <ArrowDownRight size={16} className="text-gain" />
          </div>
          <div className="mt-3">
            <p className="font-mono text-xl font-semibold text-gain">
              +${totalDeposits.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-secondary mt-1">
              Cumulative funding
            </p>
          </div>
        </div>

        {/* Total Withdrawn */}
        <div className="rounded-card border border-hairline bg-surface p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-tertiary text-xs">
            <span>Total Withdrawn</span>
            <ArrowUpRight size={16} className="text-loss" />
          </div>
          <div className="mt-3">
            <p className="font-mono text-xl font-semibold text-loss">
              -${totalWithdrawals.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-secondary mt-1">
              Broker payouts & withdrawals
            </p>
          </div>
        </div>

        {/* Net Capital Cashflow */}
        <div className="rounded-card border border-hairline bg-surface p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-tertiary text-xs">
            <span>Net Cash Flow</span>
            <Scale size={16} className="text-secondary" />
          </div>
          <div className="mt-3">
            <p className={`font-mono text-xl font-semibold ${netCashflow >= 0 ? 'text-gain' : 'text-loss'}`}>
              {netCashflow >= 0 ? '+' : '-'}${Math.abs(netCashflow).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-secondary mt-1">
              Deposits minus Withdrawals
            </p>
          </div>
        </div>

        {/* Trading Net PnL */}
        <div className="rounded-card border border-hairline bg-surface p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-tertiary text-xs">
            <span>Trading Realized P&L</span>
            <PiggyBank size={16} className="text-accent-signal" />
          </div>
          <div className="mt-3">
            <p className={`font-mono text-xl font-semibold ${totalTradingNetPnl >= 0 ? 'text-gain' : 'text-loss'}`}>
              {totalTradingNetPnl >= 0 ? '+' : '-'}${Math.abs(totalTradingNetPnl).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-secondary mt-1">
              Pure trading profit/loss
            </p>
          </div>
        </div>
      </section>

      {/* Transaction History Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-primary">
            Capital Transaction History
          </h2>
        </div>
        <TransactionList transactions={rawTransactions} />
      </section>
    </main>
  );
}
