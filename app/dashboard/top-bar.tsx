import { AccountMenu } from './account-menu';

export function TopBar({ email }: { email: string }) {
  return (
    <header className="border-hairline flex h-14 items-center justify-between border-b px-6">
      <span className="font-display text-primary text-sm">
        Trading Dashboard
      </span>
      <AccountMenu email={email} />
    </header>
  );
}
