'use client';

import clsx from 'clsx';
import { Bot, LayoutDashboard, PlugZap, Table2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Logo } from './ui';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/playground', label: 'Agent playground', icon: Bot },
  { href: '/console', label: 'Console', icon: Table2 },
  { href: '/connect', label: 'Connect an agent', icon: PlugZap },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo />
            <span>Allowance</span>
          </Link>
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
                  path.startsWith(href) ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2 hover:text-ink',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </nav>
          <span className="hidden rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 md:inline">PayPal sandbox</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
