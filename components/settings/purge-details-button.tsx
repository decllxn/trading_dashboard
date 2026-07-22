'use client';

import React, { useState } from 'react';
import { Button } from '@/components/button';
import { purgeTradeDetails } from '@/app/dashboard/settings/actions';
import { X, Trash2 } from 'lucide-react';

import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';

export function PurgeDetailsButton() {
  const [isOpen, setIsOpen] = useState(false);
  useBodyScrollLock(isOpen);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const handlePurge = async () => {
    setIsLoading(true);
    setMessage('');
    try {
      const res = await purgeTradeDetails();
      if (res.success) {
        setIsSuccess(true);
        setMessage(`Successfully cleared details for ${res.count ?? 0} trades.`);
        setTimeout(() => {
          setIsOpen(false);
          setIsSuccess(false);
          setMessage('');
        }, 3000);
      } else {
        setMessage(res.error || 'Failed to purge trade details.');
      }
    } catch (err: any) {
      setMessage(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setIsOpen(true)}
        className="border border-hairline text-secondary hover:text-loss hover:border-loss/40 transition-colors"
      >
        <Trash2 size={14} className="mr-1.5" />
        Purge Trade Details
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-base/80 backdrop-blur-sm p-3 sm:p-4">
          <div className="w-full max-w-md border border-hairline bg-surface rounded-card max-h-[85vh] flex flex-col overflow-hidden relative shadow-none">
            {/* Header */}
            <div className="sticky top-0 z-20 flex items-center justify-between border-b border-hairline bg-surface px-4 py-3 sm:px-5 shrink-0">
              <div>
                <h3 className="font-display text-base text-primary uppercase tracking-wide">
                  Purge Trade Details
                </h3>
                <p className="text-secondary text-[11px] mt-0.5">
                  Clear exact numeric details from your journal database.
                </p>
              </div>

              {/* Close Button */}
              <button
                onClick={() => !isLoading && setIsOpen(false)}
                aria-label="Close purge dialog"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-secondary hover:text-primary rounded-card border border-hairline bg-base cursor-pointer"
                disabled={isLoading}
              >
                <X size={14} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 no-scrollbar">
              {!isSuccess ? (
                <div>
                  <p className="text-secondary text-[11px] leading-relaxed mb-4">
                    This action will set the following fields to <span className="font-mono text-accent-signal">NULL</span> for all your trades:
                  </p>
                  <div className="bg-base border border-hairline p-3 rounded-card mb-4">
                    <ul className="list-disc pl-4 text-secondary text-[10px] space-y-1 font-mono">
                      <li>Entry Price / Exit Price</li>
                      <li>Stop Loss / Take Profit</li>
                      <li>Size (Quantity)</li>
                      <li>PnL / Commission / Fees / Swap</li>
                      <li>R-Multiple</li>
                    </ul>
                  </div>
                  <div className="bg-loss/10 border border-loss/20 p-3 rounded-card mb-4">
                    <p className="text-loss text-[10px] leading-normal font-medium">
                      Warning: This action is irreversible. Your screenshots (images), chart annotations (FVGs/OBs), and daily journal text entries will remain completely intact.
                    </p>
                  </div>

                  {message && <p className="text-loss text-xs mb-4">{message}</p>}
                </div>
              ) : (
                <div className="py-6 flex flex-col items-center justify-center text-center">
                  <div className="h-10 w-10 border border-accent-signal rounded bg-surface flex items-center justify-center text-accent-signal mb-4">
                    <Trash2 size={20} />
                  </div>
                  <h4 className="font-display text-accent-signal text-xs font-semibold uppercase tracking-wider">
                    Purge Complete
                  </h4>
                  <p className="text-secondary text-[11px] mt-1.5 leading-relaxed">
                    {message}
                  </p>
                </div>
              )}
            </div>

            {/* Sticky Action Footer */}
            {!isSuccess && (
              <div className="sticky bottom-0 z-20 flex justify-end gap-2.5 border-t border-hairline bg-surface p-4 shrink-0">
                <Button
                  variant="ghost"
                  onClick={() => setIsOpen(false)}
                  disabled={isLoading}
                  className="min-h-[44px]"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handlePurge}
                  disabled={isLoading}
                  className="bg-loss hover:bg-loss/90 text-primary border-transparent min-h-[44px]"
                >
                  {isLoading ? 'Purging...' : 'Confirm Purge'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
