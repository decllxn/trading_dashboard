'use client';

import React, { useState } from 'react';
import { deleteCapitalTransaction } from '@/app/dashboard/capital/actions';
import { ArrowDownRight, ArrowUpRight, Trash2, Landmark, Calendar, FileText, Search } from 'lucide-react';
import type { StatCapitalTransaction } from '@/lib/stats';

export function TransactionList({
  transactions,
}: {
  transactions: StatCapitalTransaction[];
}) {
  const [filterType, setFilterType] = useState<'all' | 'deposit' | 'withdrawal'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = transactions.filter((tx) => {
    if (filterType !== 'all' && tx.type !== filterType) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchBroker = tx.brokerName?.toLowerCase().includes(q);
      const matchNote = tx.note?.toLowerCase().includes(q);
      const matchAmount = tx.amount.toString().includes(q);
      if (!matchBroker && !matchNote && !matchAmount) return false;
    }
    return true;
  });

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this transaction record?')) return;
    setDeletingId(id);
    await deleteCapitalTransaction(id);
    setDeletingId(null);
  };

  return (
    <div className="rounded-card border border-hairline bg-surface overflow-hidden">
      {/* Filters header */}
      <div className="flex flex-col gap-3 p-4 border-b border-hairline sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-card text-xs font-medium transition-colors ${
              filterType === 'all'
                ? 'bg-accent-signal/20 text-accent-signal border border-accent-signal/30'
                : 'bg-surface-raised text-tertiary hover:text-primary'
            }`}
          >
            All ({transactions.length})
          </button>
          <button
            onClick={() => setFilterType('deposit')}
            className={`px-3 py-1.5 rounded-card text-xs font-medium transition-colors flex items-center gap-1 ${
              filterType === 'deposit'
                ? 'bg-gain/20 text-gain border border-gain/30'
                : 'bg-surface-raised text-tertiary hover:text-primary'
            }`}
          >
            <ArrowDownRight size={14} />
            Deposits ({transactions.filter((t) => t.type === 'deposit').length})
          </button>
          <button
            onClick={() => setFilterType('withdrawal')}
            className={`px-3 py-1.5 rounded-card text-xs font-medium transition-colors flex items-center gap-1 ${
              filterType === 'withdrawal'
                ? 'bg-loss/20 text-loss border border-loss/30'
                : 'bg-surface-raised text-tertiary hover:text-primary'
            }`}
          >
            <ArrowUpRight size={14} />
            Withdrawals ({transactions.filter((t) => t.type === 'withdrawal').length})
          </button>
        </div>

        {/* Search */}
        <div className="relative min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
          <input
            type="text"
            placeholder="Search broker, note, amount..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-card border border-hairline bg-surface-raised py-1.5 pl-8 pr-3 text-xs text-primary placeholder:text-tertiary focus:border-accent-signal focus:outline-none"
          />
        </div>
      </div>

      {/* List / Table */}
      {filtered.length === 0 ? (
        <div className="p-8 text-center text-tertiary text-sm">
          No capital transactions found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-raised/50 border-b border-hairline text-tertiary font-mono uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 font-normal">Type</th>
                <th className="py-3 px-4 font-normal">Amount</th>
                <th className="py-3 px-4 font-normal">Date</th>
                <th className="py-3 px-4 font-normal">Broker / Source</th>
                <th className="py-3 px-4 font-normal">Note</th>
                <th className="py-3 px-4 text-right font-normal">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filtered.map((tx) => {
                const isDeposit = tx.type === 'deposit';
                return (
                  <tr key={tx.id} className="hover:bg-surface-raised/40 transition-colors">
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                          isDeposit
                            ? 'bg-gain/15 text-gain border border-gain/30'
                            : 'bg-loss/15 text-loss border border-loss/30'
                        }`}
                      >
                        {isDeposit ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
                        {isDeposit ? 'Deposit' : 'Withdrawal'}
                      </span>
                    </td>
                    <td className={`py-3 px-4 font-mono font-semibold text-sm ${isDeposit ? 'text-gain' : 'text-loss'}`}>
                      {isDeposit ? '+' : '-'}${Number(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-secondary font-mono">
                      {new Date(tx.date).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3 px-4 text-primary font-medium">
                      {tx.brokerName || <span className="text-tertiary font-normal italic">Default</span>}
                    </td>
                    <td className="py-3 px-4 text-secondary max-w-xs truncate">
                      {tx.note || <span className="text-tertiary font-normal">—</span>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDelete(tx.id)}
                        disabled={deletingId === tx.id}
                        className="text-tertiary hover:text-loss p-1.5 rounded-card hover:bg-loss/10 transition-colors"
                        title="Delete transaction"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
