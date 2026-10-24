'use client';

import clsx from 'clsx';
import { Bot, LayoutDashboard, PlugZap, Table2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/playground', label: 'Agent playground', icon: Bot },
  { href: '/console', label: 'Console', icon: Table2 },
  { href: '/connect', label: 'Connect an agent', icon: PlugZap },
];

function CurrentNav() {
  return <Nav active={usePathname()} />;
}

function Nav({ active }: { active: string | null }) {
  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={clsx(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
            active?.startsWith(href) ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2 hover:text-ink',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

// `active` given → static render (Suspense fallback); omitted → reads the live pathname.
export function NavLinks({ active }: { active?: string | null }) {
  return active === undefined ? <CurrentNav /> : <Nav active={active} />;
}
