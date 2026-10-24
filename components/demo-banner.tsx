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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-card">
      <UserRound className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-ink-2">
        <span className="font-medium text-ink">This is your private demo.</span> Your agents, rules, history and kill switch are yours alone. Payments use a shared
        PayPal sandbox wallet, so no real money moves.
      </p>
      <button type="button" onClick={startOver} disabled={busy} className="inline-flex items-center gap-1 text-xs font-medium text-ink-2 hover:text-ink disabled:opacity-50">
        {busy ? <Spinner /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />} Start over
      </button>
    </div>
  );
}
