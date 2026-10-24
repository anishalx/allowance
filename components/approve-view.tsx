'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { use, useCallback, useEffect, useState } from 'react';
import { OperationApprovalCard } from './operation-views';
import { useSearchParam } from './use-location';
import { ApprovalCard } from './request-views';
import { Logo, Spinner, StatusChip } from './ui';
import type { DashboardOperation, DashboardRequest } from '@/lib/dashboard';
import { usd } from '@/lib/format';

type Loaded =
  | { kind: 'request'; agentName: string; item: DashboardRequest }
  | { kind: 'operation'; agentName: string; item: DashboardOperation };

// Mobile approval page opened from a phone push notification: a purchase (req_…) or a business action (op_…).
export function ApproveView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isOp = id.startsWith('op_');
  const token = useSearchParam('token', ''); // null until the browser's URL is known
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (t: string) =>
      fetch(`/api/${isOp ? 'operations' : 'requests'}/${id}?token=${encodeURIComponent(t)}`, { cache: 'no-store' }).then(async (res) => {
        const body = await res.json();
        if (!res.ok) setError(body.error);
        else setData(isOp ? { kind: 'operation', agentName: body.agentName, item: body.operation } : { kind: 'request', agentName: body.agentName, item: body.request });
      }),
    [id, isOp],
  );

  useEffect(() => {
    if (token !== null) load(token);
  }, [load, token]);

  const pending = data?.item.status === 'pending_approval' && token;
  const failed = data && ['denied', 'expired', 'failed'].includes(data.item.status);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
      <div className="mb-6 flex items-center gap-2 font-semibold">
        <Logo /> Allowance
      </div>
      {error && <p className="text-deny">{error}</p>}
      {!data && !error && <Spinner />}
      {data && pending && data.kind === 'request' && <ApprovalCard request={data.item} agentName={data.agentName} token={token} onDone={() => load(token)} />}
      {data && pending && data.kind === 'operation' && <OperationApprovalCard op={data.item} agentName={data.agentName} token={token} onDone={() => load(token)} />}
      {data && !pending && (
        <div className="slide-in rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
          {failed ? <XCircle className="mx-auto h-12 w-12 text-deny" aria-hidden="true" /> : <CheckCircle2 className="mx-auto h-12 w-12 text-allow" aria-hidden="true" />}
          <div className="tabular mt-3 text-3xl font-semibold">{usd(data.item.amountCents)}</div>
          <div className="mt-1 text-sm text-ink-2">
            {data.agentName} → {data.kind === 'request' ? data.item.merchant.name : data.item.target}
          </div>
          <div className="mt-3">
            <StatusChip status={data.item.status} decidedBy={data.item.decidedBy} />
          </div>
        </div>
      )}
    </main>
  );
}
