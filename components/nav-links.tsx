'use client';

import clsx from 'clsx';
import { Bot, LayoutDashboard, PlugZap, Table2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/playground', label: 'Playground', icon: Bot },
  { href: '/console', label: 'Console', icon: Table2 },
  { href: '/connect', label: 'Connect agent', icon: PlugZap },
];

function CurrentNav() {
  return <Nav active={usePathname()} />;
}

// On phones the links get their own full-width row under the logo, with labels, rather than bare icons.
function Nav({ active }: { active: string | null }) {
  return (
    <nav className="-mx-4 grid w-[calc(100%+2rem)] grid-cols-4 gap-1 border-t border-line px-2 py-1.5 md:mx-0 md:flex md:w-auto md:flex-1 md:items-center md:border-0 md:p-0" aria-label="Main">
      {NAV.map(({ href, label, icon: Icon }) => {
        const current = active?.startsWith(href) ?? false;
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={clsx(
              'flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-xs whitespace-nowrap transition-colors md:flex-row md:gap-2 md:px-3 md:py-2 md:text-sm',
              current ? 'bg-brand-soft font-medium text-brand' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="md:hidden">{label.split(' ')[0]}</span>
            <span className="hidden md:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// `active` given → static render (Suspense fallback); omitted → reads the live pathname.
export function NavLinks({ active }: { active?: string | null }) {
  return active === undefined ? <CurrentNav /> : <Nav active={active} />;
}
