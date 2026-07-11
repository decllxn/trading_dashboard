'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
  Bot,
  BookOpen,
  FlaskConical,
  LayoutDashboard,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Exact match for the root dashboard; startsWith for nested sections. */
  match: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    match: (p) => p === '/dashboard',
  },
  {
    label: 'Trades',
    href: '/dashboard/trades',
    icon: ArrowLeftRight,
    match: (p) => p.startsWith('/dashboard/trades'),
  },
  {
    label: 'Journal',
    href: '/dashboard/journal',
    icon: BookOpen,
    match: (p) => p.startsWith('/dashboard/journal'),
  },
  {
    label: 'Simulations',
    href: '/dashboard/simulations',
    icon: FlaskConical,
    match: (p) => p.startsWith('/dashboard/simulations'),
  },
  {
    label: 'Copilot',
    href: '/dashboard/copilot',
    icon: Bot,
    match: (p) => p.startsWith('/dashboard/copilot'),
  },
  {
    label: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
    match: (p) => p.startsWith('/dashboard/settings'),
  },
];

export function NavRail() {
  const pathname = usePathname();

  return (
    <nav className="border-hairline bg-surface flex w-16 shrink-0 flex-col items-center gap-2 border-r py-4">
      {NAV_ITEMS.map((item) => {
        const active = item.match(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group relative flex h-10 w-10 items-center justify-center rounded-card transition-colors duration-150',
              active
                ? 'text-accent-signal'
                : 'text-tertiary hover:text-primary',
            )}
          >
            {/* Active indicator: 2px accent-signal bar on the left edge. */}
            {active ? (
              <span className="bg-accent-signal absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r" />
            ) : null}
            <Icon size={18} strokeWidth={1.75} />
            {/* Label-on-hover tooltip. */}
            <span className="border-hairline bg-surface-raised text-secondary pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded-card border px-2 py-1 text-xs group-hover:block">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
