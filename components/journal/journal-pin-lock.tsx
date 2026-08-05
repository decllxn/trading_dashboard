'use client';

import { useState, useEffect, useCallback } from 'react';
import { Lock, Delete, RotateCcw, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { verifyJournalPinAction } from '@/app/dashboard/settings/actions';

interface JournalPinLockProps {
  onUnlock: () => void;
  onSetPinClick?: () => void;
}

export function JournalPinLock({ onUnlock }: JournalPinLockProps) {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isShaking, setIsShaking] = useState<boolean>(false);

  const handleDigit = useCallback(
    (digit: string) => {
      if (isVerifying || pin.length >= 4) return;
      setError(null);
      setPin((prev) => prev + digit);
    },
    [isVerifying, pin.length]
  );

  const handleBackspace = useCallback(() => {
    if (isVerifying) return;
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  }, [isVerifying]);

  const handleClear = useCallback(() => {
    if (isVerifying) return;
    setError(null);
    setPin('');
  }, [isVerifying]);

  // Physical keyboard listener
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        handleClear();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDigit, handleBackspace, handleClear]);

  // Auto-verify when 4 digits are reached
  useEffect(() => {
    if (pin.length === 4) {
      let isMounted = true;
      setIsVerifying(true);
      verifyJournalPinAction(pin).then((res) => {
        if (!isMounted) return;
        setIsVerifying(false);
        if (res.success) {
          onUnlock();
        } else {
          setError(res.error || 'Incorrect PIN');
          setIsShaking(true);
          setTimeout(() => {
            if (isMounted) {
              setPin('');
              setIsShaking(false);
            }
          }, 500);
        }
      });
      return () => {
        isMounted = false;
      };
    }
  }, [pin, onUnlock]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-base/95 p-4 backdrop-blur-md">
      <div
        className={cn(
          'w-full max-w-sm rounded-card border border-hairline bg-surface p-6 sm:p-8 text-center transition-transform duration-150',
          isShaking && 'animate-bounce border-loss/50'
        )}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-card bg-accent-signal/15 text-accent-signal">
          <Lock size={22} strokeWidth={1.75} />
        </div>

        <h2 className="mt-4 font-display text-lg text-primary">
          Journal Screen Lock
        </h2>
        <p className="mt-1 text-xs text-secondary">
          Enter your 4-digit PIN to view daily journal notes
        </p>

        {/* 4 Digit Indicators */}
        <div className="my-6 flex justify-center gap-3">
          {[0, 1, 2, 3].map((idx) => {
            const hasDigit = pin.length > idx;
            return (
              <div
                key={idx}
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-card border text-lg font-mono transition-all duration-150',
                  hasDigit
                    ? 'border-accent-signal bg-accent-signal/10 text-accent-signal shadow-sm'
                    : 'border-hairline bg-surface-raised text-tertiary'
                )}
              >
                {hasDigit ? '•' : ''}
              </div>
            );
          })}
        </div>

        {/* Error message */}
        {error ? (
          <p className="mb-4 text-xs font-medium text-loss animate-fade-in">
            {error}
          </p>
        ) : (
          <div className="h-5" />
        )}

        {/* Numpad */}
        <div className="mx-auto grid max-w-[240px] grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(num)}
              disabled={isVerifying || pin.length >= 4}
              className="flex h-12 w-full items-center justify-center rounded-card border border-hairline bg-surface-raised font-mono text-base font-semibold text-primary transition-colors duration-150 hover:border-accent-signal hover:bg-surface-raised/80 hover:text-accent-signal active:scale-95 disabled:opacity-50"
            >
              {num}
            </button>
          ))}

          <button
            type="button"
            onClick={handleClear}
            disabled={isVerifying || pin.length === 0}
            aria-label="Clear PIN"
            className="flex h-12 w-full items-center justify-center rounded-card border border-hairline bg-surface-raised text-tertiary transition-colors duration-150 hover:text-primary active:scale-95 disabled:opacity-30"
          >
            <RotateCcw size={16} />
          </button>

          <button
            type="button"
            onClick={() => handleDigit('0')}
            disabled={isVerifying || pin.length >= 4}
            className="flex h-12 w-full items-center justify-center rounded-card border border-hairline bg-surface-raised font-mono text-base font-semibold text-primary transition-colors duration-150 hover:border-accent-signal hover:bg-surface-raised/80 hover:text-accent-signal active:scale-95 disabled:opacity-50"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            disabled={isVerifying || pin.length === 0}
            aria-label="Delete last digit"
            className="flex h-12 w-full items-center justify-center rounded-card border border-hairline bg-surface-raised text-tertiary transition-colors duration-150 hover:text-primary active:scale-95 disabled:opacity-30"
          >
            <Delete size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
