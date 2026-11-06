'use client';

import { RotateCcw, UserRound } from 'lucide-react';
import { useState } from 'react';
import type { DashboardState } from '@/lib/dashboard';
import { Spinner } from './ui';
import { api } from './use-dashboard';

// Shown to public-demo visitors so they know nothing they do here affects anyone else.
export function DemoBanner({ household, onReset }: { household: DashboardState['household'] | undefined; onReset: () => void }) {
  const [busy, setBusy] = useState(false);
  if (household !== 'visitor') return null;

  async function startOver() {
    if (!confirm('Start your demo over? Your agents, rules and history go back to how they began.')) return;
    setBusy(true);
    try {
      await api('/api/demo/reset', { method: 'POST' });
      onReset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-surface-2 px-4 py-2.5 text-sm">
      <UserRound className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-ink-2">
        <span className="font-medium text-ink">Your private demo.</span> Only you see it, and it runs on PayPal&apos;s sandbox: no real money moves.
      </p>
      <button
        type="button"
        onClick={startOver}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-ink-2 hover:bg-white hover:text-ink disabled:opacity-50"
      >
        {busy ? <Spinner /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />} Start over
      </button>
    </div>
  );
}
