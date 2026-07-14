'use client';

import { useState, useTransition } from 'react';
import { X, Calendar, Trash2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { TradeRow } from '@/lib/trades';
import {
  capitalize,
  formatEntryDate,
  formatPrice,
  formatPnl,
  formatR,
  pnlColorClass,
  rColorClass,
} from '@/lib/trades';
import { deleteTrade } from '@/app/dashboard/trades/actions';
import { ScreenshotGallery } from './screenshot-gallery';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface TradeDetailModalProps {
  trade: TradeRow;
  onClose: () => void;
}

export function TradeDetailModal({ trade, onClose }: TradeDetailModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isClosed = trade.status === 'closed';

  const handleDelete = () => {
    if (deleteInput !== trade.instrument) return;

    startTransition(async () => {
      try {
        const res = await deleteTrade(trade.id);
        if (res?.error) {
          setDeleteError(res.error);
        } else {
          onClose();
        }
      } catch (err: any) {
        setDeleteError(err.message || 'Failed to delete trade.');
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      {/* Modal Container */}
      <div className="w-full max-w-2xl border border-hairline bg-surface rounded-card max-h-[90vh] overflow-y-auto no-scrollbar">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-primary text-lg font-medium tracking-tight">
              {trade.instrument}
            </h2>
            <Link
              href={`/dashboard/trades/${trade.id}`}
              className="text-secondary hover:text-accent-signal transition-colors inline-flex items-center gap-1"
              title="Open full page"
            >
              <ArrowUpRight size={14} />
            </Link>
            <span className="flex items-center gap-1 px-2 py-0.5 border border-hairline rounded text-[10px] font-medium text-secondary uppercase">
              {trade.direction === 'long' ? (
                <ArrowUpRight size={10} className="text-secondary" />
              ) : (
                <ArrowDownRight size={10} className="text-secondary" />
              )}
              {trade.direction}
            </span>
            <span className="px-2 py-0.5 border border-hairline rounded text-[10px] font-medium text-secondary uppercase">
              {trade.status}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-secondary hover:text-primary transition-colors p-1"
          >
            <X size={16} />
          </button>
        </header>

        {/* Modal Content */}
        <div className="p-6 space-y-6">
          {/* Top Headline Stats */}
          <div className="grid grid-cols-3 gap-4 border border-hairline/60 bg-surface-raised/40 p-4 rounded-card">
            <div>
              <span className="text-tertiary text-[10px] uppercase tracking-wide font-sans block mb-1">
                Net P&amp;L
              </span>
              <span className={cn('num text-lg font-semibold block', pnlColorClass(trade.pnl))}>
                {formatPnl(trade.pnl)}
              </span>
            </div>
            <div>
              <span className="text-tertiary text-[10px] uppercase tracking-wide font-sans block mb-1">
                R-Multiple
              </span>
              <span className={cn('num text-lg font-semibold block', rColorClass(trade.rMultiple))}>
                {trade.rMultiple != null ? formatR(trade.rMultiple) : '—'}
              </span>
            </div>
            <div>
              <span className="text-tertiary text-[10px] uppercase tracking-wide font-sans block mb-1">
                Size
              </span>
              <span className="num text-primary text-lg block">
                {trade.size != null ? trade.size.toLocaleString() : '—'}
              </span>
            </div>
          </div>

          {/* Trade Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Levels */}
            <div className="space-y-3">
              <h3 className="font-display text-primary text-xs uppercase tracking-wide border-b border-hairline pb-1.5">
                Levels
              </h3>
              <dl className="space-y-2 text-xs">
                <DetailRow label="Entry Price" value={formatPrice(trade.entryPrice)} isMono />
                {isClosed && <DetailRow label="Exit Price" value={formatPrice(trade.exitPrice)} isMono />}
                <DetailRow label="Stop Price" value={formatPrice(trade.stopPrice)} isMono />
                <DetailRow label="Target Price" value={formatPrice(trade.targetPrice)} isMono />
              </dl>
            </div>

            {/* Execution Timing */}
            <div className="space-y-3">
              <h3 className="font-display text-primary text-xs uppercase tracking-wide border-b border-hairline pb-1.5">
                Execution Details
              </h3>
              <dl className="space-y-2 text-xs">
                <DetailRow label="Entry Date" value={formatEntryDate(trade.entryTime)} />
                <DetailRow
                  label="Entry Time"
                  value={trade.entryTime ? new Date(trade.entryTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'}
                  isMono
                />
                {isClosed && (
                  <>
                    <DetailRow label="Exit Date" value={formatEntryDate(trade.exitTime)} />
                    <DetailRow
                      label="Exit Time"
                      value={trade.exitTime ? new Date(trade.exitTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'}
                      isMono
                    />
                  </>
                )}
              </dl>
            </div>

            {/* Carrying Costs */}
            <div className="space-y-3">
              <h3 className="font-display text-primary text-xs uppercase tracking-wide border-b border-hairline pb-1.5">
                Carrying Costs
              </h3>
              <dl className="space-y-2 text-xs">
                <DetailRow label="Gross P&amp;L" value={formatPnl(trade.grossPnl)} valueClass={pnlColorClass(trade.grossPnl)} isMono />
                <DetailRow label="Commission" value={trade.commission != null ? `−$${trade.commission.toFixed(2)}` : '—'} isMono />
                <DetailRow label="Swap" value={trade.swap != null ? `−$${trade.swap.toFixed(2)}` : '—'} isMono />
                <DetailRow label="Fees" value={trade.fees != null ? `−$${trade.fees.toFixed(2)}` : '—'} isMono />
              </dl>
            </div>

            {/* Context & Tags */}
            <div className="space-y-3">
              <h3 className="font-display text-primary text-xs uppercase tracking-wide border-b border-hairline pb-1.5">
                Setup Context
              </h3>
              <dl className="space-y-2 text-xs">
                <DetailRow label="Daily PD Array" value={trade.dailyPdArray || '—'} />
                <DetailRow label="1 Hr PD Array" value={trade.oneHourPdArray || '—'} />
                <DetailRow label="30 Min PD Array" value={trade.thirtyMinutePdArray || '—'} />
                <div className="flex flex-col gap-1.5 pt-1">
                  <dt className="text-secondary">Tags</dt>
                  <dd>
                    {trade.tags.length === 0 ? (
                      <span className="text-tertiary">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {trade.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="border-hairline text-secondary rounded border px-1.5 py-0.5 text-[9px] font-medium font-sans uppercase"
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Screenshots Gallery */}
          {trade.images && trade.images.length > 0 && (
            <div className="border-t border-hairline pt-6">
              <ScreenshotGallery images={trade.images} />
            </div>
          )}

          {/* Delete Riddle Sub-flow */}
          {isDeleting ? (
            <div className="border border-hairline bg-surface-raised rounded-card p-4 space-y-3">
              <h3 className="font-display text-primary text-xs uppercase tracking-wide">
                Confirm Deletion
              </h3>
              <p className="text-secondary text-xs leading-relaxed">
                This action is permanent and cannot be undone. To proceed, please type the instrument name{' '}
                <span className="font-mono text-primary font-semibold select-none px-1 py-0.5 bg-surface rounded border border-hairline">
                  {trade.instrument}
                </span>{' '}
                below:
              </p>
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                className="w-full bg-surface border border-hairline focus:border-accent-signal focus:outline-none rounded-card px-3 py-2 text-sm text-primary font-mono placeholder-tertiary"
                placeholder={trade.instrument}
                autoFocus
              />
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsDeleting(false);
                    setDeleteInput('');
                    setDeleteError(null);
                  }}
                  className="text-secondary hover:text-primary px-3 py-1.5 text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteInput !== trade.instrument || isPending}
                  onClick={handleDelete}
                  className="bg-red-950/20 border border-red-900/60 hover:bg-red-900/40 text-red-400 disabled:opacity-20 disabled:pointer-events-none rounded-card px-3 py-1.5 text-xs font-semibold transition-colors"
                >
                  {isPending ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
              {deleteError && (
                <p className="text-xs text-red-400 mt-1 font-medium">{deleteError}</p>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {!isDeleting && (
          <footer className="flex items-center justify-between border-t border-hairline px-6 py-4 bg-surface-raised/20">
            <button
              type="button"
              onClick={() => setIsDeleting(true)}
              className="text-secondary hover:text-red-400 border border-hairline/80 hover:bg-red-950/10 rounded-card px-3 py-2 text-xs font-medium inline-flex items-center gap-1.5 transition-colors duration-150"
            >
              <Trash2 size={13} />
              Delete trade
            </button>

            <button
              type="button"
              onClick={onClose}
              className="bg-surface-raised text-primary border border-hairline hover:bg-surface-raised/85 rounded-card px-4 py-2 text-xs font-medium transition-colors"
            >
              Close
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
  valueClass?: string;
  isMono?: boolean;
}

function DetailRow({ label, value, valueClass, isMono }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between py-1">
      <dt className="text-secondary font-sans">{label}</dt>
      <dd className={cn('text-primary text-right font-medium', isMono && 'num', valueClass)}>
        {value}
      </dd>
    </div>
  );
}
