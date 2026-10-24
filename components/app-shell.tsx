import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { NavLinks } from './nav-links';
import { Logo } from './ui';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo />
            <span>Allowance</span>
          </Link>
          {/* The active-link highlight needs the pathname, which is request-time data. */}
          <Suspense fallback={<NavLinks active={null} />}>
            <NavLinks />
          </Suspense>
          <span className="hidden rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 md:inline">PayPal sandbox</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
