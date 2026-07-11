'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut } from '@/app/(auth)/actions';

export function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="num text-secondary hover:text-primary max-w-[200px] truncate rounded-card px-3 py-1.5 text-xs transition-colors duration-150"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {email}
      </button>
      {open ? (
        <div
          role="menu"
          className="border-hairline bg-surface absolute right-0 top-full mt-1 w-44 rounded-card border p-1"
        >
          <p className="num text-tertiary truncate px-3 py-1.5 text-xs">
            {email}
          </p>
          <div className="border-hairline my-1 border-t" />
          <button
            type="button"
            role="menuitem"
            onClick={() => signOut()}
            className="text-secondary hover:text-primary w-full rounded-card px-3 py-1.5 text-left text-xs transition-colors duration-150"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
