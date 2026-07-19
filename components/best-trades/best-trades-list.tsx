'use client';

import React, { useState } from 'react';
import { deleteBestTrade } from '@/app/dashboard/best-trades/actions';
import { Calendar, Trash2, Link2, X, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface BestTradeItem {
  id: string;
  instrument: string;
  timeFormed: string;
  dailyPdArray: string | null;
  hourlyPdArray: string | null;
  images: string[];
  notes: string | null;
  wasTaken: boolean;
  linkedTradeId: string | null;
  rMultiple: string | null;
  createdAt: string;
}

function getWeekStartingDateString(dateInput: string | Date): string {
  const d = new Date(dateInput);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface BestTradesListProps {
  items: ReadonlyArray<BestTradeItem>;
}

export function BestTradesList({ items }: BestTradesListProps) {
  const [selectedTrade, setSelectedTrade] = useState<BestTradeItem | null>(null);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this best trade entry?')) return;

    setIsDeleting(true);
    setErrorMsg('');
    try {
      const res = await deleteBestTrade(id);
      if (res.success) {
        setSelectedTrade(null);
      } else {
        setErrorMsg(res.error || 'Failed to delete entry.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
    } finally {
      setIsDeleting(false);
    }
  };

  const openDetails = (trade: BestTradeItem) => {
    setSelectedTrade(trade);
    setActiveImageIdx(0);
    setErrorMsg('');
  };

  return (
    <>
      {items.length === 0 ? (
        <div className="border border-hairline bg-surface rounded-card p-12 text-center">
          <Calendar className="mx-auto h-8 w-8 text-tertiary mb-3" />
          <h3 className="font-display text-primary text-xs font-semibold uppercase tracking-wider">
            No Best Trades Logged
          </h3>
          <p className="text-secondary text-[11px] mt-1.5 leading-relaxed max-w-sm mx-auto">
            Log your top weekly setups, mark whether they were executed, and catalog your ideal model trading templates.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => {
            const hasImages = t.images && t.images.length > 0;
            const formedDate = new Date(t.timeFormed);

            return (
              <div
                key={t.id}
                onClick={() => openDetails(t)}
                className="border border-hairline bg-surface hover:border-hairline/80 rounded-card overflow-hidden cursor-pointer flex flex-col h-full group"
              >
                {/* Header info */}
                <div className="p-4 border-b border-hairline/40 flex justify-between items-start">
                  <div>
                    <h3 className="font-display text-sm font-bold text-primary tracking-wide">
                      {t.instrument}
                    </h3>
                    <p className="text-[10px] text-tertiary mt-0.5 font-mono tabular-nums">
                      Week starting: {getWeekStartingDateString(t.timeFormed)}
                    </p>
                  </div>
                  {t.wasTaken && (
                    <span className="border border-accent-signal/30 text-accent-signal bg-accent-signal/5 font-mono text-[9px] font-semibold px-2 py-0.5 rounded-sm">
                      TAKEN {t.rMultiple ? `(${Number(t.rMultiple).toFixed(2)}R)` : ''}
                    </span>
                  )}
                </div>

                {/* Primary Image preview */}
                {hasImages ? (
                  <div className="relative h-44 w-full bg-base overflow-hidden border-b border-hairline/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={t.images[0]}
                      alt={`${t.instrument} setup`}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                    />
                    <div className="absolute inset-0 bg-base/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-150">
                      <div className="bg-surface/90 border border-hairline p-1.5 rounded-sm text-secondary">
                        <Eye size={14} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-44 w-full bg-base/50 flex flex-col items-center justify-center border-b border-hairline/40 text-tertiary">
                    <Calendar size={20} />
                    <span className="text-[9px] uppercase tracking-wider font-semibold mt-1">No Image</span>
                  </div>
                )}

                {/* Body Details */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div className="grid grid-cols-2 gap-2 text-[10px] mb-3">
                    <div>
                      <span className="text-tertiary uppercase font-display font-semibold tracking-wider block">Daily PD Array</span>
                      <span className="text-secondary truncate block mt-0.5">{t.dailyPdArray || '--'}</span>
                    </div>
                    <div>
                      <span className="text-tertiary uppercase font-display font-semibold tracking-wider block">H/30m PD Array</span>
                      <span className="text-secondary truncate block mt-0.5">{t.hourlyPdArray || '--'}</span>
                    </div>
                  </div>

                  {t.notes && (
                    <p className="text-secondary text-[11px] leading-relaxed line-clamp-2 mb-4">
                      {t.notes}
                    </p>
                  )}

                  {/* Actions & Links */}
                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-hairline/40">
                    <div className="flex items-center gap-2">
                      {t.linkedTradeId && (
                        <Link
                          href={`/dashboard/trades/${t.linkedTradeId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-tertiary hover:text-accent-signal transition-colors inline-flex items-center gap-1 text-[10px]"
                        >
                          <Link2 size={12} />
                          <span>Linked execution</span>
                        </Link>
                      )}
                    </div>
                    <button
                      onClick={(e) => handleDelete(t.id, e)}
                      className="text-tertiary hover:text-loss transition-colors p-1 rounded-sm cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selectedTrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-base/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl border border-hairline bg-surface rounded-card p-5 relative max-h-[90vh] overflow-y-auto no-scrollbar">
            {/* Close */}
            <button
              onClick={() => setSelectedTrade(null)}
              className="absolute right-4 top-4 text-secondary hover:text-primary p-1 rounded-sm border border-hairline bg-base cursor-pointer z-10"
            >
              <X size={14} />
            </button>

            {/* Title / Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pr-8 border-b border-hairline/40 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-primary tracking-wide">
                  {selectedTrade.instrument} — Week Setup Details
                </h3>
                <p className="text-[10px] text-secondary mt-0.5 font-mono tabular-nums">
                  Week starting: {getWeekStartingDateString(selectedTrade.timeFormed)} (Formed: {new Date(selectedTrade.timeFormed).toLocaleString()})
                </p>
              </div>

              <div className="flex items-center gap-2">
                {selectedTrade.wasTaken ? (
                  <span className="border border-accent-signal/30 text-accent-signal bg-accent-signal/5 font-mono text-[10px] font-semibold px-2.5 py-1 rounded-sm">
                    TAKEN {selectedTrade.rMultiple ? `(${Number(selectedTrade.rMultiple).toFixed(2)}R)` : ''}
                  </span>
                ) : (
                  <span className="border border-hairline text-secondary font-mono text-[10px] px-2.5 py-1 rounded-sm">
                    MODEL SETUP
                  </span>
                )}
                <button
                  onClick={(e) => handleDelete(selectedTrade.id, e)}
                  disabled={isDeleting}
                  className="bg-base border border-hairline hover:border-loss/40 hover:text-loss text-secondary p-2 rounded-sm transition-colors cursor-pointer"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {errorMsg && (
              <p className="rounded-card border border-loss/20 bg-loss/10 p-3 text-xs text-loss mb-4">
                {errorMsg}
              </p>
            )}

            {/* Layout split */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Media viewer */}
              <div className="lg:col-span-7 space-y-3">
                {selectedTrade.images && selectedTrade.images.length > 0 ? (
                  <div className="space-y-2">
                    {/* Big image */}
                    <div className="relative aspect-video w-full border border-hairline bg-base rounded overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedTrade.images[activeImageIdx]}
                        alt="Best trade screenshot"
                        className="h-full w-full object-contain"
                      />
                    </div>
                    {/* Thumbnail gallery */}
                    {selectedTrade.images.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto py-1 no-scrollbar">
                        {selectedTrade.images.map((img, idx) => (
                          <button
                            key={img}
                            onClick={() => setActiveImageIdx(idx)}
                            className={cn(
                              "relative h-12 w-20 rounded border bg-base overflow-hidden shrink-0 transition-colors cursor-pointer",
                              activeImageIdx === idx ? "border-accent-signal" : "border-hairline"
                            )}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img} alt="Thumb" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="aspect-video w-full border border-hairline bg-base flex flex-col items-center justify-center rounded text-tertiary">
                    <Calendar size={28} />
                    <span className="text-[10px] uppercase font-semibold mt-1">No chart screenshot uploaded</span>
                  </div>
                )}
              </div>

              {/* Data / Notes */}
              <div className="lg:col-span-5 space-y-4">
                <div className="border border-hairline bg-base p-4 rounded-card">
                  <h4 className="font-display text-[10px] font-bold text-primary uppercase tracking-wider mb-3">
                    Setup Alignments
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-tertiary font-display text-[9px] uppercase tracking-wider font-bold">Daily PD Array</span>
                      <p className="text-secondary text-xs mt-0.5">{selectedTrade.dailyPdArray || 'None'}</p>
                    </div>
                    <div>
                      <span className="text-tertiary font-display text-[9px] uppercase tracking-wider font-bold">Hourly/30m PD Array</span>
                      <p className="text-secondary text-xs mt-0.5">{selectedTrade.hourlyPdArray || 'None'}</p>
                    </div>
                  </div>

                  {selectedTrade.linkedTradeId && (
                    <div className="mt-4 pt-3 border-t border-hairline/40">
                      <span className="text-tertiary font-display text-[9px] uppercase tracking-wider font-bold block">Linked Trade execution</span>
                      <Link
                        href={`/dashboard/trades/${selectedTrade.linkedTradeId}`}
                        className="text-accent-signal hover:underline text-xs mt-0.5 inline-flex items-center gap-1"
                      >
                        <Link2 size={12} />
                        View Execution Log
                      </Link>
                    </div>
                  )}
                </div>

                <div className="border border-hairline bg-base p-4 rounded-card flex-1">
                  <h4 className="font-display text-[10px] font-bold text-primary uppercase tracking-wider mb-2">
                    Analysis Notes
                  </h4>
                  <p className="text-secondary text-xs leading-relaxed whitespace-pre-wrap">
                    {selectedTrade.notes || 'No analysis notes provided.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
