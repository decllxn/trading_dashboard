'use client';

import React, { useState } from 'react';
import { Button } from '@/components/button';
import { connectBroker, connectMt5Broker } from '@/app/dashboard/settings/actions';
import { X, Bot, Shield, Key } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';

export function ConnectBrokerModal({ userId }: { userId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  useBodyScrollLock(isOpen);
  const [step, setStep] = useState<'select' | 'mt5' | 'loading' | 'success'>('select');
  const [brokerName, setBrokerName] = useState('Pepperstone');
  const [customBrokerName, setCustomBrokerName] = useState('');
  const [accountRef, setAccountRef] = useState('');
  const [serverName, setServerName] = useState('Pepperstone-MT5-Live');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/mt5/webhook?userId=${userId}&token=${userId}`
    : '';

  const mql5Script = `//+------------------------------------------------------------------+
//|                                                   MT5_Webhook.mq5|
//|                                  Copyright 2026, Antigravity     |
//|                                             https://antigravity  |
//+------------------------------------------------------------------+
#property copyright "Antigravity"
#property link      "https://antigravity"
#property version   "1.00"
#property indicator_chart_window

input string WebhookUrl = "${webhookUrl}"; // Webhook URL preconfigured

int OnInit() { return(INIT_SUCCEEDED); }

void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest& request,
                        const MqlTradeResult& result)
{
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
   {
      ulong deal_ticket = trans.deal;
      if(HistoryDealSelect(deal_ticket))
      {
         long entry = HistoryDealGetInteger(deal_ticket, DEAL_ENTRY);
         if(entry == 1) // Deal Entry Out (trade closed)
         {
            string symbol = HistoryDealGetString(deal_ticket, DEAL_SYMBOL);
            double volume = HistoryDealGetDouble(deal_ticket, DEAL_VOLUME);
            double price_exit = HistoryDealGetDouble(deal_ticket, DEAL_PRICE);
            double profit = HistoryDealGetDouble(deal_ticket, DEAL_PROFIT);
            long deal_type = HistoryDealGetInteger(deal_ticket, DEAL_TYPE);
            
            string dir = (deal_type == 1) ? "long" : "short";
            double price_entry = price_exit;
            double sl = 0;
            double tp = 0;
            
            ulong position_id = HistoryDealGetInteger(deal_ticket, DEAL_POSITION_ID);
            if(HistorySelectByPosition(position_id))
            {
               int total_deals = HistoryDealsTotal();
               for(int i=0; i<total_deals; i++)
               {
                  ulong d_ticket = HistoryDealGetTicket(i);
                  if(d_ticket != deal_ticket && HistoryDealGetInteger(d_ticket, DEAL_POSITION_ID) == position_id)
                  {
                     if(HistoryDealGetInteger(d_ticket, DEAL_ENTRY) == 0) // DEAL_ENTRY_IN
                     {
                        price_entry = HistoryDealGetDouble(d_ticket, DEAL_PRICE);
                        break;
                     }
                  }
               }
            }

            string headers = "Content-Type: application/json\\r\\n";
            string body = StringFormat(
               "{\\"symbol\\":\\"%s\\",\\"direction\\":\\"%s\\",\\"entry_price\\":%.5f,\\"exit_price\\":%.5f,\\"size\\":%.2f,\\"stop_loss\\":%.5f,\\"take_profit\\":%.5f,\\"entry_time\\":\\"%s\\",\\"exit_time\\":\\"%s\\",\\"pnl\\":%.2f}",
               symbol, dir, price_entry, price_exit, volume * 100000.0, sl, tp, 
               TimeToString(TimeCurrent()-3600, TIME_DATE|TIME_MINUTES), 
               TimeToString(TimeCurrent(), TIME_DATE|TIME_MINUTES), profit
            );

            char data[];
            char res_data[];
            string res_headers;
            StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
            if(ArraySize(data) > 0) ArrayResize(data, ArraySize(data) - 1);
            
            int res = WebRequest("POST", WebhookUrl, headers, 5000, data, res_data, res_headers);
            if(res == 200 || res == 201) {
               Print("MT5 Webhook: Sync success for ticket ", deal_ticket);
            } else {
               Print("MT5 Webhook: Sync error ", res);
            }
         }
      }
   }
}`;

  const copyToClipboard = (text: string, isUrl: boolean) => {
    navigator.clipboard.writeText(text);
    if (isUrl) {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    setStep('select');
    setErrorMsg('');
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleConnectSnapTrade = async () => {
    setErrorMsg('');
    try {
      await connectBroker();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to open connection portal.');
    }
  };

  const handleConnectMt5 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountRef.trim()) {
      setErrorMsg('Account number is required');
      return;
    }
    const finalBrokerName = brokerName === 'Custom' ? customBrokerName : brokerName;
    if (!finalBrokerName.trim()) {
      setErrorMsg('Broker name is required');
      return;
    }

    setErrorMsg('');
    setStep('loading');
    try {
      await connectMt5Broker(finalBrokerName, accountRef, serverName);
      setStep('success');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect MT5 broker');
      setStep('mt5');
    }
  };

  return (
    <>
      <Button onClick={handleOpen}>Connect a broker</Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-base/80 backdrop-blur-sm p-4">
          <div className={`w-full border border-hairline bg-surface rounded-card p-5 relative max-h-[85vh] overflow-y-auto no-scrollbar transition-all ${
            step === 'success' ? 'max-w-xl' : 'max-w-md'
          }`}>
            {/* Close Button */}
            <button
              onClick={handleClose}
              aria-label="Close broker modal"
              className="absolute right-3 top-3 min-h-[44px] min-w-[44px] flex items-center justify-center text-secondary hover:text-primary rounded-card border border-hairline bg-base cursor-pointer"
            >
              <X size={14} />
            </button>

            {step === 'select' && (
              <div>
                <h3 className="font-display text-base text-primary uppercase tracking-wide mb-1">
                  Connect Brokerage
                </h3>
                <p className="text-secondary text-xs mb-5">
                  Select your brokerage platform style to sync execution logs.
                </p>

                <div className="space-y-3">
                  {/* Option 1: Forex MT5 */}
                  <button
                    onClick={() => setStep('mt5')}
                    className="w-full flex items-start gap-3.5 p-4 border border-hairline bg-base hover:border-accent-signal/50 hover:bg-surface-raised rounded-card text-left transition-colors cursor-pointer group"
                  >
                    <div className="p-2 border border-hairline bg-surface rounded text-accent-signal group-hover:border-accent-signal/30">
                      <Key size={18} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-display text-primary text-xs font-semibold uppercase tracking-wider">
                        Forex MT5 Account (Pepperstone)
                      </h4>
                      <p className="text-secondary text-[11px] mt-1 leading-relaxed">
                        Connect a MetaTrader 5 account from Pepperstone, IC Markets, or other Forex brokers.
                      </p>
                    </div>
                  </button>

                  {/* Option 2: SnapTrade */}
                  <button
                    onClick={handleConnectSnapTrade}
                    className="w-full flex items-start gap-3.5 p-4 border border-hairline bg-base hover:border-accent-signal/50 hover:bg-surface-raised rounded-card text-left transition-colors cursor-pointer group"
                  >
                    <div className="p-2 border border-hairline bg-surface rounded text-accent-signal group-hover:border-accent-signal/30">
                      <Bot size={18} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-display text-primary text-xs font-semibold uppercase tracking-wider">
                        Retail Brokerages (SnapTrade)
                      </h4>
                      <p className="text-secondary text-[11px] mt-1 leading-relaxed">
                        Link commercial equities accounts (Schwab, Fidelity, Interactive Brokers, Robinhood).
                      </p>
                    </div>
                  </button>
                </div>

                {errorMsg && (
                  <p className="text-loss text-xs mt-4 text-center">{errorMsg}</p>
                )}
              </div>
            )}

            {step === 'mt5' && (
              <form onSubmit={handleConnectMt5}>
                <h3 className="font-display text-base text-primary uppercase tracking-wide mb-1">
                  MT5 Broker Connection
                </h3>
                <p className="text-secondary text-xs mb-5">
                  Enter your MetaTrader 5 credentials for Pepperstone or other Forex brokers.
                </p>

                <div className="space-y-4">
                  {/* Broker Name Dropdown */}
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-tertiary font-display block mb-1">
                      Forex Broker Name
                    </label>
                    <select
                      value={brokerName}
                      onChange={(e) => setBrokerName(e.target.value)}
                      className="w-full bg-base border border-hairline focus:border-accent-signal rounded px-3 py-2 text-xs text-primary outline-none transition-colors"
                    >
                      <option value="Pepperstone">Pepperstone</option>
                      <option value="IC Markets">IC Markets</option>
                      <option value="Custom">Custom Broker</option>
                    </select>
                  </div>

                  {/* Custom Broker name if "Custom" selected */}
                  {brokerName === 'Custom' && (
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-tertiary font-display block mb-1">
                        Enter Custom Broker Name
                      </label>
                      <input
                        type="text"
                        value={customBrokerName}
                        onChange={(e) => setCustomBrokerName(e.target.value)}
                        placeholder="e.g. Pepperstone"
                        required
                        className="w-full bg-base border border-hairline focus:border-accent-signal rounded px-3 py-2 text-xs text-primary outline-none transition-colors"
                      />
                    </div>
                  )}

                  {/* MT5 Server */}
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-tertiary font-display block mb-1">
                      MT5 Server Name
                    </label>
                    <input
                      type="text"
                      value={serverName}
                      onChange={(e) => setServerName(e.target.value)}
                      placeholder="e.g. Pepperstone-MT5-Live"
                      required
                      className="w-full bg-base border border-hairline focus:border-accent-signal rounded px-3 py-2 text-xs text-primary outline-none transition-colors"
                    />
                  </div>

                  {/* Account Number */}
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-tertiary font-display block mb-1">
                      MT5 Account Login ID
                    </label>
                    <input
                      type="text"
                      value={accountRef}
                      onChange={(e) => setAccountRef(e.target.value)}
                      placeholder="e.g. 50012345"
                      required
                      className="w-full bg-base border border-hairline focus:border-accent-signal rounded px-3 py-2 text-xs text-primary outline-none transition-colors"
                    />
                  </div>

                  {/* Password */}
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-tertiary font-display block mb-1">
                      Password / Investor Password (Masked)
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-base border border-hairline focus:border-accent-signal rounded px-3 py-2 text-xs text-primary outline-none transition-colors"
                    />
                  </div>
                </div>

                {errorMsg && (
                  <p className="text-loss text-xs mt-3">{errorMsg}</p>
                )}

                <div className="flex justify-end gap-2.5 mt-6 border-t border-hairline/40 pt-4">
                  <Button variant="ghost" onClick={() => setStep('select')}>
                    Back
                  </Button>
                  <Button type="submit">Connect MT5</Button>
                </div>
              </form>
            )}

            {step === 'loading' && (
              <div className="flex flex-col items-center justify-center py-10">
                <div className="animate-spin h-8 w-8 border-2 border-accent-signal border-t-transparent rounded-full mb-4" />
                <h4 className="font-display text-primary text-xs font-semibold uppercase tracking-wider">
                  Establishing Connection
                </h4>
                <p className="text-secondary text-[11px] text-center mt-1.5 leading-relaxed">
                  Authenticating with {brokerName === 'Custom' ? customBrokerName : brokerName} MT5 Server and retrieving execution history...
                </p>
              </div>
            )}

            {step === 'success' && (
              <div className="py-2">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-8 w-8 border border-accent-signal rounded bg-surface flex items-center justify-center text-accent-signal shrink-0">
                    <Shield size={16} />
                  </div>
                  <div>
                    <h4 className="font-display text-primary text-xs font-semibold uppercase tracking-wider">
                      MT5 Auto-Sync Active
                    </h4>
                    <p className="text-secondary text-[11px] mt-0.5">
                      Your Pepperstone MT5 connection is established. Set up your webhook to sync trades automatically.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Webhook URL Input Group */}
                  <div className="bg-surface-raised border border-hairline p-3 rounded-card">
                    <label className="text-[9px] uppercase tracking-wider text-tertiary font-display block mb-1 font-bold">
                      Your Webhook Endpoint URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={webhookUrl}
                        className="flex-1 bg-base border border-hairline rounded px-2.5 py-1.5 text-[10px] text-secondary font-mono outline-none"
                      />
                      <button
                        onClick={() => copyToClipboard(webhookUrl, true)}
                        className="bg-accent-signal hover:bg-accent-signal/90 text-base text-[10px] font-semibold px-3 py-1.5 rounded border border-transparent transition-colors cursor-pointer"
                      >
                        {copiedUrl ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  {/* Setup Guide */}
                  <div className="text-xs space-y-2">
                    <h5 className="font-display font-bold uppercase text-[9px] text-primary tracking-wider">
                      Setup Instructions:
                    </h5>
                    <ol className="list-decimal pl-4 space-y-1.5 text-secondary text-[11px] leading-relaxed">
                      <li>Open MetaTrader 5 on your PC/VPS.</li>
                      <li>Go to **Tools &gt; Options &gt; Expert Advisors**.</li>
                      <li>Check **Allow WebRequest for listed URL** and add: `http://localhost:3000` (or your deployed app domain).</li>
                      <li>Create a new Expert Advisor in MetaEditor, paste the script below, and attach it to any chart.</li>
                    </ol>
                  </div>

                  {/* Code Block */}
                  <div className="relative">
                    <pre className="font-mono text-[9px] text-secondary bg-surface-raised border border-hairline p-3 rounded max-h-40 overflow-y-auto no-scrollbar">
                      {mql5Script}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(mql5Script, false)}
                      className="absolute right-2 top-2 bg-surface hover:bg-surface-raised text-secondary hover:text-primary text-[9px] border border-hairline px-2 py-1 rounded transition-colors cursor-pointer"
                    >
                      {copiedScript ? 'Copied Script!' : 'Copy Script'}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 mt-5 border-t border-hairline/40 pt-4">
                  <Button onClick={handleClose}>Done</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
