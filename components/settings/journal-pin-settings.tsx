'use client';

import { useState } from 'react';
import { Lock, ShieldCheck, KeyRound, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  saveJournalPinAction,
  removeJournalPinAction,
} from '@/app/dashboard/settings/actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface JournalPinSettingsProps {
  hasPin: boolean;
}

export function JournalPinSettings({ hasPin }: JournalPinSettingsProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<'set' | 'remove'>('set');

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function openSetModal() {
    setMode('set');
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setError(null);
    setSuccessMsg(null);
    setModalOpen(true);
  }

  function openRemoveModal() {
    setMode('remove');
    setCurrentPin('');
    setError(null);
    setSuccessMsg(null);
    setModalOpen(true);
  }

  async function handleSavePin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (hasPin && !/^\d{4}$/.test(currentPin)) {
      setError('Enter your current 4-digit PIN.');
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      setError('New PIN must be exactly 4 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setError('New PIN and Confirmation PIN do not match.');
      return;
    }

    setLoading(true);
    const res = await saveJournalPinAction(newPin, hasPin ? currentPin : undefined);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to save PIN.');
    } else {
      setSuccessMsg('Journal PIN updated successfully.');
      setTimeout(() => {
        setModalOpen(false);
      }, 1000);
    }
  }

  async function handleRemovePin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!/^\d{4}$/.test(currentPin)) {
      setError('Enter your current 4-digit PIN.');
      return;
    }

    setLoading(true);
    const res = await removeJournalPinAction(currentPin);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to remove PIN.');
    } else {
      setSuccessMsg('Journal PIN lock removed.');
      setTimeout(() => {
        setModalOpen(false);
      }, 1000);
    }
  }

  return (
    <section className="mt-6 rounded-card border border-hairline bg-surface">
      <div className="flex flex-col gap-4 border-b border-hairline p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg text-primary">
              Journal Security Lock
            </h2>
            {hasPin ? (
              <span className="inline-flex items-center gap-1 rounded-card border border-gain/30 bg-gain/10 px-2 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wider text-gain">
                <ShieldCheck size={12} /> Active PIN
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-card border border-hairline bg-surface-raised px-2 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wider text-tertiary">
                Disabled
              </span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-secondary">
            Protect your private daily journal notes and psychological reflections behind a 4-digit PIN screen lock.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasPin ? (
            <>
              <button
                type="button"
                onClick={openSetModal}
                className="rounded-card border border-hairline bg-surface-raised px-3 py-1.5 text-xs text-primary transition-colors hover:border-accent-signal hover:text-accent-signal"
              >
                Change PIN
              </button>
              <button
                type="button"
                onClick={openRemoveModal}
                className="rounded-card border border-hairline/80 bg-surface px-3 py-1.5 text-xs text-tertiary transition-colors hover:border-loss/50 hover:text-loss"
              >
                Remove PIN
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={openSetModal}
              className="flex items-center gap-1.5 rounded-card bg-accent-signal px-3.5 py-1.5 text-xs font-medium text-base transition-opacity hover:opacity-90"
            >
              <Lock size={14} /> Set 4-Digit PIN
            </button>
          )}
        </div>
      </div>

      {/* PIN Dialog Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound size={18} className="text-accent-signal" />
              {mode === 'set' ? (hasPin ? 'Change Journal PIN' : 'Set 4-Digit PIN') : 'Disable Journal PIN Lock'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {mode === 'set'
                ? 'Enter a 4-digit numeric code to protect your daily journal.'
                : 'Confirm your current 4-digit PIN to disable journal screen lock.'}
            </DialogDescription>
          </DialogHeader>

          {mode === 'set' ? (
            <form onSubmit={handleSavePin} className="mt-2 space-y-4">
              {hasPin && (
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">
                    Current 4-Digit PIN
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full rounded-card border border-hairline bg-surface-raised px-3 py-2 text-center font-mono text-base tracking-widest text-primary focus:border-accent-signal focus:outline-none"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  New 4-Digit PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full rounded-card border border-hairline bg-surface-raised px-3 py-2 text-center font-mono text-base tracking-widest text-primary focus:border-accent-signal focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Confirm New PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full rounded-card border border-hairline bg-surface-raised px-3 py-2 text-center font-mono text-base tracking-widest text-primary focus:border-accent-signal focus:outline-none"
                  required
                />
              </div>

              {error && <p className="text-xs text-loss font-medium">{error}</p>}
              {successMsg && <p className="text-xs text-gain font-medium flex items-center gap-1"><Check size={14} /> {successMsg}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-card border border-hairline px-3 py-1.5 text-xs text-secondary hover:text-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-card bg-accent-signal px-4 py-1.5 text-xs font-medium text-base hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save PIN'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRemovePin} className="mt-2 space-y-4">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Current 4-Digit PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full rounded-card border border-hairline bg-surface-raised px-3 py-2 text-center font-mono text-base tracking-widest text-primary focus:border-accent-signal focus:outline-none"
                  required
                />
              </div>

              {error && <p className="text-xs text-loss font-medium">{error}</p>}
              {successMsg && <p className="text-xs text-gain font-medium flex items-center gap-1"><Check size={14} /> {successMsg}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-card border border-hairline px-3 py-1.5 text-xs text-secondary hover:text-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-card bg-loss px-4 py-1.5 text-xs font-medium text-primary hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? 'Removing...' : 'Remove PIN Lock'}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
