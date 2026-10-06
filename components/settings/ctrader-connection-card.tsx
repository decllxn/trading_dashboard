'use client';

import React, { useState } from 'react';
import { Button } from '@/components/button';
import { RefreshCw, Radio, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { useCTraderEvents } from '@/hooks/use-ctrader-events';

interface CTraderAccountItem {
  id: string;
  ctidTraderAccountId: string;
  accountNumber: string | null;
  brokerTitle: string;
  currency: string;
  balance: string | null;
  equity: string | null;
  lastSyncedAt: string | null;
}

interface CTraderConnectionCardProps {
  accounts: CTraderAccountItem[];
}

export function CTraderConnectionCard({ accounts }: CTraderConnectionCardProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const { isConnected: isLiveSocketConnected, latestBalance } = useCTraderEvents();

  const isConnected = accounts.length > 0;
  const primaryAccount = accounts[0];

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await fetch('/api/ctrader/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to sync');
      }
      const first = data.syncedAccounts?.[0];
      const countDeals = first?.dealsCount ?? 0;
      const countPos = first?.positionsCount ?? 0;
      setSyncResult(
        `Synchronized ${countDeals} closed deals & ${countPos} open positions. Balance: $${Number(first?.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      );
    } catch (err: any) {
      setSyncError(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="mt-6 rounded-card border border-hairline bg-surface overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-hairline p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="font-display text-lg text-primary">
              cTrader Open API
            </h2>
            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                CONNECTED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-tertiary bg-base border border-hairline">
                NOT CONNECTED
              </span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-secondary">
            Direct real-time telemetry from your cTrader / Pepperstone account via official Open API. Automatically tracks open/close prices, lot sizes, commissions, swaps, and live balance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <Button
              variant="ghost"
              onClick={handleSyncNow}
              disabled={syncing}
              className="flex items-center gap-1.5"
            >
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </Button>
          ) : (
            <a href="/api/ctrader/connect">
              <Button className="flex items-center gap-1.5">
                <ExternalLink size={13} />
                Connect cTrader
              </Button>
            </a>
          )}
        </div>
      </div>

      {isConnected && primaryAccount ? (
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="p-3.5 rounded border border-hairline bg-base">
              <span className="text-[10px] uppercase tracking-wider text-tertiary font-display block">
                Account ID / Login
              </span>
              <span className="num text-sm text-primary font-medium mt-1 block">
                {primaryAccount.ctidTraderAccountId}
              </span>
            </div>

            <div className="p-3.5 rounded border border-hairline bg-base">
              <span className="text-[10px] uppercase tracking-wider text-tertiary font-display block">
                Live Balance
              </span>
              <span className="num text-sm text-primary font-medium mt-1 block">
                {latestBalance != null
                  ? `$${latestBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : primaryAccount.balance != null
                  ? `$${Number(primaryAccount.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—'}
              </span>
            </div>

            <div className="p-3.5 rounded border border-hairline bg-base">
              <span className="text-[10px] uppercase tracking-wider text-tertiary font-display block">
                Broker / Currency
              </span>
              <span className="text-sm text-primary font-medium mt-1 block">
                {primaryAccount.brokerTitle} ({primaryAccount.currency})
              </span>
            </div>

            <div className="p-3.5 rounded border border-hairline bg-base">
              <span className="text-[10px] uppercase tracking-wider text-tertiary font-display block">
                Real-Time Stream
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                <Radio
                  size={14}
                  className={isLiveSocketConnected ? 'text-emerald-400' : 'text-amber-400'}
                />
                <span className="text-xs text-secondary font-mono">
                  {isLiveSocketConnected ? 'Protobuf Live' : 'Listening...'}
                </span>
              </div>
            </div>
          </div>

          {syncResult && (
            <div className="mt-4 flex items-center gap-2 p-3 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
              <CheckCircle2 size={14} />
              <span>{syncResult}</span>
            </div>
          )}

          {syncError && (
            <div className="mt-4 flex items-center gap-2 p-3 rounded bg-loss/10 border border-loss/20 text-loss text-xs">
              <AlertCircle size={14} />
              <span>{syncError}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-base/40">
          <div className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-primary font-display">
              Ready to authenticate
            </h4>
            <p className="text-xs text-secondary max-w-xl">
              Click &quot;Connect cTrader&quot; to authorize read-only access to your cTrader ID. Your trades will be streamed directly into the journal in real time.
            </p>
          </div>
          <a href="/api/ctrader/connect">
            <Button className="whitespace-nowrap text-xs px-3 py-1.5">
              Connect cTrader Account
            </Button>
          </a>
        </div>
      )}
    </section>
  );
}
