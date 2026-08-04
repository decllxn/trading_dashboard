'use client';

import React, { useState } from 'react';
import { Button } from '@/components/button';
import { addCapitalTransaction } from '@/app/dashboard/capital/actions';
import { X, ArrowDownRight, ArrowUpRight, DollarSign, Calendar, Landmark, FileText } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';

export function AddTransactionModal({
  defaultType = 'withdrawal',
  onSuccess,
}: {
  defaultType?: 'deposit' | 'withdrawal';
  onSuccess?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  useBodyScrollLock(isOpen);

  const [type, setType] = useState<'deposit' | 'withdrawal'>(defaultType);
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [brokerName, setBrokerName] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const quickAmounts = ['10', '11', '50', '100', '500', '1000'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const formData = new FormData();
    formData.append('type', type);
    formData.append('amount', amount);
    formData.append('date', date);
    formData.append('brokerName', brokerName);
    formData.append('note', note);

    const res = await addCapitalTransaction(formData);
    setLoading(false);

    if (res?.error) {
      setErrorMsg(res.error);
    } else {
      setIsOpen(false);
      setAmount('');
      setNote('');
      if (onSuccess) onSuccess();
    }
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant="primary"
        className="flex items-center gap-2 font-sans shadow-lg hover:shadow-accent-signal/20"
      >
        <DollarSign size={16} />
        <span>Log Deposit / Withdrawal</span>
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-hairline bg-surface p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline pb-4">
              <div>
                <h2 className="font-display text-xl text-primary flex items-center gap-2">
                  <Landmark size={20} className="text-accent-signal" />
                  Log Capital Transaction
                </h2>
                <p className="text-xs text-secondary mt-0.5">
                  Record deposits or withdrawals to keep account balance and equity curves accurate.
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-tertiary hover:bg-surface-raised hover:text-primary transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-4 rounded-card border border-loss/30 bg-loss/10 p-3 text-xs text-loss">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {/* Type selector */}
              <div>
                <label className="text-xs uppercase tracking-wide text-tertiary block mb-2 font-mono">
                  Transaction Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setType('deposit')}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-card text-sm font-medium border transition-all ${
                      type === 'deposit'
                        ? 'border-gain bg-gain/15 text-gain shadow-inner'
                        : 'border-hairline bg-surface-raised text-secondary hover:text-primary'
                    }`}
                  >
                    <ArrowDownRight size={18} className="text-gain" />
                    Deposit (+ Cash)
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('withdrawal')}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-card text-sm font-medium border transition-all ${
                      type === 'withdrawal'
                        ? 'border-loss bg-loss/15 text-loss shadow-inner'
                        : 'border-hairline bg-surface-raised text-secondary hover:text-primary'
                    }`}
                  >
                    <ArrowUpRight size={18} className="text-loss" />
                    Withdrawal (- Cash)
                  </button>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="text-xs uppercase tracking-wide text-tertiary block mb-1.5 font-mono">
                  Amount ($ USD / Account Currency)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary font-mono">
                    $
                  </span>
                  <input
                    type="number"
                    step="any"
                    required
                    min="0.01"
                    placeholder="e.g. 11.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-card border border-hairline bg-surface-raised py-2.5 pl-8 pr-3 text-sm text-primary placeholder:text-tertiary focus:border-accent-signal focus:outline-none font-mono"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[10px] text-tertiary uppercase tracking-wider font-mono">Quick set:</span>
                  {quickAmounts.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setAmount(q)}
                      className="px-2 py-0.5 rounded border border-hairline bg-surface-raised text-[11px] font-mono text-secondary hover:text-primary hover:border-accent-signal transition-colors"
                    >
                      ${q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="text-xs uppercase tracking-wide text-tertiary block mb-1.5 font-mono flex items-center gap-1">
                  <Calendar size={13} />
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-card border border-hairline bg-surface-raised py-2 px-3 text-sm text-primary focus:border-accent-signal focus:outline-none font-mono"
                />
              </div>

              {/* Broker Name (Optional) */}
              <div>
                <label className="text-xs uppercase tracking-wide text-tertiary block mb-1.5 font-mono flex items-center gap-1">
                  <Landmark size={13} />
                  Broker / Source (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pepperstone, Alpaca, Broker 1"
                  value={brokerName}
                  onChange={(e) => setBrokerName(e.target.value)}
                  className="w-full rounded-card border border-hairline bg-surface-raised py-2 px-3 text-sm text-primary placeholder:text-tertiary focus:border-accent-signal focus:outline-none"
                />
              </div>

              {/* Note (Optional) */}
              <div>
                <label className="text-xs uppercase tracking-wide text-tertiary block mb-1.5 font-mono flex items-center gap-1">
                  <FileText size={13} />
                  Note / Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Profit withdrawal, monthly deposit"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-card border border-hairline bg-surface-raised py-2 px-3 text-sm text-primary placeholder:text-tertiary focus:border-accent-signal focus:outline-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-hairline">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={loading}
                  className="min-w-[120px]"
                >
                  {loading ? 'Saving...' : `Record ${type === 'deposit' ? 'Deposit' : 'Withdrawal'}`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
