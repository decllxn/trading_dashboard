'use client';

import { ChevronDown } from 'lucide-react';
import { AccountMenu } from './account-menu';

/**
 * Static selector placeholder. Real account/timeframe data wiring comes later;
 * for now it just holds the visual slot in the top bar.
 */
function Selector({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="text-secondary hover:text-primary flex items-center gap-1 rounded-card px-2 py-1 text-xs transition-colors duration-150"
    >
      <span className="num">{label}</span>
      <ChevronDown size={12} strokeWidth={1.75} />
    </button>
  );
}

export function TopBar({ email }: { email: string }) {
  return (
    <header className="border-hairline bg-base flex h-14 items-center justify-between border-b px-6">
      <div className="flex items-center gap-6">
        <span className="font-display text-primary text-sm">
          Trading Dashboard
        </span>
      </div>
      <div className="flex items-center gap-4">
        <Selector label="Paper · Alpaca" />
        <span className="border-hairline h-4 border-l" />
        <Selector label="1M" />
        <span className="border-hairline h-4 border-l" />
        <AccountMenu email={email} />
      </div>
    </header>
  );
}
