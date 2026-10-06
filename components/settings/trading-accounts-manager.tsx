'use client';

import { useTransition, useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Plus, Check, ArrowRightLeft, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createTradingAccount, switchTradingAccount, type TradingAccountState } from '@/app/dashboard/settings/actions';

export type Account = {
  id: string;
  name: string;
  startingBalance: string;
  isActive: boolean;
  createdAt: string;
};

interface Props {
  accounts: Account[];
  activeAccountId: string | null;
}

const initialState: TradingAccountState = {};

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full sm:w-auto px-4 py-2 bg-primary text-base font-display text-xs uppercase tracking-wider rounded-card hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
    >
      <Plus className="w-3.5 h-3.5" />
      {pending ? 'Creating…' : 'Create Account'}
    </button>
  );
}

export function TradingAccountsManager({ accounts, activeAccountId }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isSwitching, startTransition] = useTransition();
  const [state, formAction] = useFormState<TradingAccountState, FormData>(createTradingAccount, initialState);

  const handleSwitch = (accountId: string) => {
    startTransition(async () => {
      const result = await switchTradingAccount(accountId);
      if (result?.success) {
        router.refresh();
      }
    });
  };

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm uppercase tracking-wide text-primary">Your Accounts</h3>
          <span className="num text-xs text-tertiary">{accounts.length} account{accounts.length === 1 ? '' : 's'}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.map((account) => {
            const isActive = account.id === activeAccountId || account.isActive;

            return (
              <div
                key={account.id}
                className={cn(
                  'p-4 border rounded-card flex flex-col justify-between transition-all duration-150',
                  isActive
                    ? 'border-accent-signal/40 bg-surface-raised ring-1 ring-accent-signal/20'
                    : 'border-hairline bg-surface hover:border-hairline/80'
                )}
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-display font-medium text-sm text-primary flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-tertiary" />
                      {account.name}
                    </h4>
                    {isActive ? (
                      <span className="flex items-center gap-1 text-[11px] font-display uppercase tracking-wider text-gain px-2 py-0.5 rounded-full bg-gain/10 border border-gain/20">
                        <Check className="w-3 h-3" />
                        Active
                      </span>
                    ) : null}
                  </div>
                  <p className="text-tertiary text-xs mb-3">
                    Created {new Date(account.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                  
                  <div className="space-y-0.5 mb-4">
                    <p className="text-[11px] uppercase tracking-wider font-display text-tertiary">Starting Balance</p>
                    <p className="num text-base font-semibold text-primary">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      }).format(Number(account.startingBalance))}
                    </p>
                  </div>
                </div>

                {!isActive ? (
                  <button
                    type="button"
                    onClick={() => handleSwitch(account.id)}
                    disabled={isSwitching}
                    className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-card bg-base hover:bg-surface-raised border border-hairline text-xs font-display uppercase tracking-wider text-secondary hover:text-primary transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    {isSwitching ? 'Switching…' : 'Switch to Account'}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-4 border border-hairline rounded-card bg-surface">
        <h4 className="font-display text-xs uppercase tracking-wide text-primary mb-3 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5 text-accent-signal" />
          Create New Account
        </h4>
        
        <form ref={formRef} action={formAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="accountName" className="text-xs uppercase tracking-wide font-display text-tertiary block">
                Account Name
              </label>
              <input
                id="accountName"
                name="accountName"
                type="text"
                required
                placeholder="e.g. Fresh Start Aug 2026"
                className="w-full px-3 py-2 bg-base border border-hairline rounded-card text-sm text-primary focus:outline-none focus:ring-1 focus:ring-accent-signal placeholder:text-tertiary"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="startingBalance" className="text-xs uppercase tracking-wide font-display text-tertiary block">
                Starting Balance ($)
              </label>
              <input
                id="startingBalance"
                name="startingBalance"
                type="number"
                step="any"
                min="0"
                required
                placeholder="10000"
                className="num w-full px-3 py-2 bg-base border border-hairline rounded-card text-sm text-primary focus:outline-none focus:ring-1 focus:ring-accent-signal placeholder:text-tertiary"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="activateNow"
              name="activateNow"
              type="checkbox"
              value="true"
              defaultChecked
              className="rounded border-hairline bg-base text-accent-signal focus:ring-0 accent-accent-signal cursor-pointer"
            />
            <label htmlFor="activateNow" className="text-xs text-secondary cursor-pointer">
              Set as active account immediately
            </label>
          </div>

          {state?.error ? (
            <p className="text-xs text-loss">{state.error}</p>
          ) : null}
          {state?.success ? (
            <p className="text-xs text-accent-signal">Trading account created successfully.</p>
          ) : null}

          <div className="flex justify-end pt-1">
            <CreateButton />
          </div>
        </form>
      </div>
    </div>
  );
}

