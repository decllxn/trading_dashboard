'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
  Bot,
  BookOpen,
  FlaskConical,
  LayoutDashboard,
  LayoutGrid,
  Settings,
  Trophy,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCopilot } from '@/components/copilot/copilot-provider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  /** Exact match for the root dashboard; startsWith for nested sections. */
  match: (pathname: string) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: 'Overview, Edge Score & performance stats',
    match: (p) => p === '/dashboard',
  },
  {
    label: 'Trades',
    href: '/dashboard/trades',
    icon: ArrowLeftRight,
    description: 'Trade log, execution history & analytics',
    match: (p) => p.startsWith('/dashboard/trades'),
  },
  {
    label: 'Capital',
    href: '/dashboard/capital',
    icon: Wallet,
    description: 'Deposits, withdrawals & account cashflow',
    match: (p) => p.startsWith('/dashboard/capital'),
  },
  {
    label: 'Journal',
    href: '/dashboard/journal',
    icon: BookOpen,
    description: 'Daily notes & psychology reflections',
    match: (p) => p.startsWith('/dashboard/journal'),
  },
  {
    label: 'Simulations',
    href: '/dashboard/simulations',
    icon: FlaskConical,
    description: 'Monte Carlo & strategy stress testing',
    match: (p) => p.startsWith('/dashboard/simulations'),
  },
  {
    label: 'Copilot',
    href: '/dashboard/copilot',
    icon: Bot,
    description: 'AI trading assistant & automated insights',
    match: (p) => p.startsWith('/dashboard/copilot'),
  },
  {
    label: 'Best Trades',
    href: '/dashboard/best-trades',
    icon: Trophy,
    description: 'Playbook hall of fame & A+ setups',
    match: (p) => p.startsWith('/dashboard/best-trades'),
  },
  {
    label: 'Ranks',
    href: '/dashboard/gamification',
    icon: Target,
    description: 'Rank progression, milestones & XP',
    match: (p) => p.startsWith('/dashboard/gamification'),
  },
  {
    label: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
    description: 'Broker connections & account config',
    match: (p) => p.startsWith('/dashboard/settings'),
  },
];

// 4 primary quick tabs for mobile bottom bar
const PRIMARY_MOBILE_ITEMS: NavItem[] = [
  NAV_ITEMS[0], // Dashboard
  NAV_ITEMS[1], // Trades
  NAV_ITEMS[3], // Journal
  NAV_ITEMS[5], // Copilot
];

export function NavRail() {
  const pathname = usePathname();
  const { loading } = useCopilot();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    function handleOpenMobileNav() {
      setMobileDrawerOpen(true);
    }
    window.addEventListener('open-mobile-nav', handleOpenMobileNav);
    return () => {
      window.removeEventListener('open-mobile-nav', handleOpenMobileNav);
    };
  }, []);

  const isPrimaryActive = PRIMARY_MOBILE_ITEMS.some((item) => item.match(pathname));
  const isMoreActive = !isPrimaryActive;

  return (
    <>
      {/* Desktop 64px Icon Rail (hidden on mobile) */}
      <nav className="border-hairline bg-surface z-40 hidden md:flex w-16 shrink-0 flex-col items-center gap-2 border-r py-4">
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          const isCopilot = item.label === 'Copilot';
          const isCopilotLoading = isCopilot && loading;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group relative flex h-11 w-11 items-center justify-center rounded-card transition-colors duration-150',
                active
                  ? 'text-accent-signal'
                  : 'text-tertiary hover:text-primary',
              )}
            >
              {/* Active indicator: 2px accent-signal bar on the left edge. */}
              {active ? (
                <span className="bg-accent-signal absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r" />
              ) : null}

              <Icon
                size={19}
                strokeWidth={1.75}
                className={cn(isCopilotLoading && 'animate-pulse text-accent-signal')}
              />

              {/* Background thinking ping dot */}
              {isCopilotLoading && (
                <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-accent-signal animate-ping" />
              )}

              {/* Label-on-hover tooltip. */}
              <span className="border-hairline bg-surface-raised text-secondary pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-card border px-2 py-1 text-xs group-hover:block">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Mobile Bottom Nav Bar (visible on < 768px) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden h-14 items-center justify-around border-t border-hairline bg-surface px-1 backdrop-blur-md">
        {PRIMARY_MOBILE_ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          const isCopilot = item.label === 'Copilot';
          const isCopilotLoading = isCopilot && loading;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center rounded-card py-1 transition-colors duration-150',
                active ? 'text-accent-signal font-medium' : 'text-tertiary hover:text-primary',
              )}
            >
              <Icon
                size={18}
                strokeWidth={1.75}
                className={cn(isCopilotLoading && 'animate-pulse text-accent-signal')}
              />
              <span className="mt-0.5 text-[9px] font-sans tracking-tight">
                {item.label}
              </span>

              {/* Mobile Active indicator bar on top */}
              {active ? (
                <span className="bg-accent-signal absolute top-0 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-b" />
              ) : null}
            </Link>
          );
        })}

        {/* 5th Tab: "More" trigger to open Mobile All Views Drawer */}
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          aria-label="More navigation options"
          className={cn(
            'relative flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center rounded-card py-1 transition-colors duration-150',
            isMoreActive ? 'text-accent-signal font-medium' : 'text-tertiary hover:text-primary',
          )}
        >
          <LayoutGrid size={18} strokeWidth={1.75} />
          <span className="mt-0.5 text-[9px] font-sans tracking-tight">
            More
          </span>

          {isMoreActive ? (
            <span className="bg-accent-signal absolute top-0 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-b" />
          ) : null}
        </button>
      </nav>

      {/* Mobile Views Navigation Drawer / Bottom Sheet */}
      <Dialog open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-50 bg-base/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogContent className="fixed bottom-0 left-0 right-0 top-auto z-50 translate-x-0 translate-y-0 border-t border-x-0 border-b-0 border-hairline bg-surface rounded-t-xl rounded-b-none p-4 sm:p-6 duration-200 max-h-[85vh] overflow-y-auto no-scrollbar focus:outline-none shadow-none w-full max-w-full">
            <DialogHeader className="flex flex-row items-center justify-between pb-3 mb-2 border-b border-hairline/60">
              <div>
                <DialogTitle className="font-display text-primary text-base flex items-center gap-2">
                  <LayoutGrid size={18} className="text-accent-signal" />
                  All Navigation Views
                </DialogTitle>
                <DialogDescription className="text-secondary text-xs mt-0.5">
                  Select a section to switch views
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-2 pt-1 pb-4">
              {NAV_ITEMS.map((item) => {
                const active = item.match(pathname);
                const Icon = item.icon;
                const isCopilot = item.label === 'Copilot';
                const isCopilotLoading = isCopilot && loading;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileDrawerOpen(false)}
                    className={cn(
                      'group flex items-center justify-between p-3 rounded-card border transition-all duration-150 min-h-[48px]',
                      active
                        ? 'border-accent-signal/50 bg-surface-raised/80 text-primary'
                        : 'border-hairline/60 bg-base/40 text-secondary hover:border-hairline hover:bg-surface-raised/40 hover:text-primary'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-card transition-colors duration-150',
                          active
                            ? 'bg-accent-signal/15 text-accent-signal'
                            : 'bg-surface-raised text-tertiary group-hover:text-primary'
                        )}
                      >
                        <Icon
                          size={18}
                          strokeWidth={1.75}
                          className={cn(isCopilotLoading && 'animate-pulse text-accent-signal')}
                        />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span
                          className={cn(
                            'font-display text-sm leading-tight truncate',
                            active ? 'text-primary font-medium' : 'text-secondary group-hover:text-primary'
                          )}
                        >
                          {item.label}
                        </span>
                        <span className="text-[11px] text-tertiary truncate font-sans mt-0.5">
                          {item.description}
                        </span>
                      </div>
                    </div>

                    {active ? (
                      <span className="shrink-0 ml-2 text-[10px] font-mono font-medium text-accent-signal bg-accent-signal/10 border border-accent-signal/30 px-2 py-0.5 rounded-card uppercase tracking-wider">
                        Active
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </>
  );
}

