import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { NavLinks } from './nav-links';
import { Logo } from './ui';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 px-4 md:h-16 md:flex-nowrap">
          <Link href="/" className="flex h-14 items-center gap-2.5 text-[17px] font-semibold tracking-tight md:h-auto">
            <Logo />
            <span>Allowance</span>
          </Link>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-2 md:order-last md:ml-0">
            <span className="h-1.5 w-1.5 rounded-full bg-allow" aria-hidden="true" /> PayPal sandbox
          </span>
          {/* The active-link highlight needs the pathname, which is request-time data. */}
          <Suspense fallback={<NavLinks active={null} />}>
            <NavLinks />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 md:py-10">{children}</main>
    </div>
  );
}
