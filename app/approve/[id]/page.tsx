'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { use, useCallback, useEffect, useState } from 'react';
import { ApprovalCard } from '@/components/request-views';
import { Logo, Spinner, StatusChip } from '@/components/ui';
import type { DashboardRequest } from '@/lib/dashboard';
import { usd } from '@/lib/format';

// Mobile approval page opened from a phone push notification.
export default function ApprovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<{ agentName: string; request: DashboardRequest } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (t: string) => {
    const res = await fetch(`/api/requests/${id}?token=${encodeURIComponent(t)}`, { cache: 'no-store' });
    const body = await res.json();
    if (!res.ok) setError(body.error);
    else setData(body);
  }, [id]);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token') ?? '';
    setToken(t);
    load(t);
  }, [load]);

  const r = data?.request;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
      <div className="mb-6 flex items-center gap-2 font-semibold">
        <Logo /> Allowance
      </div>
      {error && <p className="text-deny">{error}</p>}
      {!data && !error && <Spinner />}
      {r && r.status === 'pending_approval' && token && (
        <ApprovalCard request={r} agentName={data.agentName} token={token} onDone={() => load(token)} />
      )}
      {r && r.status !== 'pending_approval' && (
        <div className="slide-in rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
          {['denied', 'expired', 'failed'].includes(r.status) ? (
            <XCircle className="mx-auto h-12 w-12 text-deny" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mx-auto h-12 w-12 text-allow" aria-hidden="true" />
          )}
          <div className="tabular mt-3 text-3xl font-semibold">{usd(r.amountCents)}</div>
          <div className="mt-1 text-sm text-ink-2">
            {data.agentName} → {r.merchant.name}
          </div>
          <div className="mt-3">
            <StatusChip status={r.status} decidedBy={r.decidedBy} />
          </div>
        </div>
      )}
    </main>
  );
}
