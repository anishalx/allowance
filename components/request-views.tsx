'use client';

import clsx from 'clsx';
import { BadgeCheck, Ban, Check, CircleAlert, Clock, ShieldAlert, Sparkles, Undo2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DashboardRequest } from '@/lib/dashboard';
import { timeAgo, titleCase, usd } from '@/lib/format';
import { api } from './use-dashboard';
import { Button, Chip, Spinner, StatusChip } from './ui';

function useCountdown(iso: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [iso]);
  if (!iso) return null;
  const s = Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function MerchantLabel({ merchant }: { merchant: DashboardRequest['merchant'] }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-medium">{merchant.name}</span>
      {merchant.verified ? (
        <BadgeCheck className="h-4 w-4 text-allow" aria-label="Verified merchant" />
      ) : (
        <Chip tone="deny" className="ml-1">
          Unverified payee
        </Chip>
      )}
    </span>
  );
}

export function RiskBadge({ audit }: { audit: DashboardRequest['audit'] }) {
  if (!audit) return null;
  const tone = audit.verdict === 'malicious' ? 'deny' : audit.verdict === 'suspicious' ? 'ask' : 'allow';
  return (
    <Chip tone={tone}>
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      AI risk {audit.riskScore}
    </Chip>
  );
}

function reasonFor(r: DashboardRequest) {
  const asks = r.policyChecks.filter((c) => c.outcome === 'approval').map((c) => c.detail);
  return { asks, auditorEscalated: r.decidedBy === 'auditor' };
}

export function ApprovalCard({ request, agentName, token, onDone }: { request: DashboardRequest; agentName: string; token?: string; onDone?: () => void }) {
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const countdown = useCountdown(request.approvalExpiresAt);
  const { asks, auditorEscalated } = reasonFor(request);

  async function decide(action: 'approve' | 'deny') {
    setBusy(action);
    setError(null);
    try {
      await api(`/api/requests/${request.id}/decision`, { method: 'POST', json: { action, token } });
      onDone?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="slide-in pulse-ask rounded-2xl border-2 border-ask/50 bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-ink-2">
            <span className="font-semibold text-ink">{agentName}</span> wants to pay
          </div>
          <div className="mt-0.5 text-sm">
            <MerchantLabel merchant={request.merchant} />
          </div>
        </div>
        <div className="text-right">
          <div className="tabular text-3xl font-semibold tracking-tight">{usd(request.amountCents)}</div>
          {countdown && (
            <div className="mt-1 inline-flex items-center gap-1 text-xs text-ink-3">
              <Clock className="h-3 w-3" aria-hidden="true" /> expires in {countdown}
            </div>
          )}
        </div>
      </div>

      <ul className="mt-4 divide-y divide-line rounded-xl bg-surface-2 px-3 text-sm">
        {request.items.map((i, n) => (
          <li key={n} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 truncate">
              {i.quantity}× {i.name} <span className="text-xs text-ink-3">· {titleCase(i.category)}</span>
            </span>
            <span className="tabular text-ink-2">{usd(Math.round(i.unitPrice * 100) * i.quantity)}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-sm text-ink-2">
        <span className="font-medium text-ink">Agent says:</span> “{request.purpose}”
      </p>

      <div className="mt-3 space-y-2 text-sm">
        {asks.map((a) => (
          <div key={a} className="flex items-start gap-2 text-ask">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{a}</span>
          </div>
        ))}
        {request.audit && request.audit.verdict !== 'consistent' && (
          <div className={clsx('flex items-start gap-2 rounded-lg p-2', auditorEscalated ? 'bg-ai-soft text-ai' : 'text-ai')}>
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-medium">AI auditor (risk {request.audit.riskScore}):</span> {request.audit.explanation}
            </span>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-deny">{error}</p>}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button variant="secondary" size="lg" className="px-3 whitespace-nowrap" disabled={!!busy} onClick={() => decide('deny')}>
          {busy === 'deny' ? <Spinner /> : <X className="h-4 w-4" aria-hidden="true" />} Deny
        </Button>
        <Button variant="allow" size="lg" className="px-3 whitespace-nowrap" disabled={!!busy} onClick={() => decide('approve')}>
          {busy === 'approve' ? <Spinner /> : <Check className="h-4 w-4" aria-hidden="true" />} Approve &amp; pay
        </Button>
      </div>
    </div>
  );
}

const OUTCOME_STYLE = {
  pass: { icon: Check, cls: 'text-allow' },
  approval: { icon: CircleAlert, cls: 'text-ask' },
  deny: { icon: Ban, cls: 'text-deny' },
} as const;

function Mono({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-ink-2">{label}</span>
      <span className="truncate font-mono text-xs">{value}</span>
    </div>
  );
}

export function DecisionTrace({ request, agentName, onChanged }: { request: DashboardRequest; agentName: string; onChanged?: () => void }) {
  const [refunding, setRefunding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = request;
  const finalBy = { policy: 'Rules engine', auditor: 'AI auditor', human: 'You', timeout: 'Timed out' }[r.decidedBy];

  async function doRefund() {
    setRefunding(true);
    setError(null);
    try {
      await api(`/api/requests/${r.id}/refund`, { method: 'POST', json: { reason: 'Refunded from the dashboard' } });
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRefunding(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={r.status} decidedBy={r.decidedBy} />
          <span className="text-xs text-ink-3">{timeAgo(r.createdAt)}</span>
        </div>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <div className="text-sm text-ink-2">{agentName} →</div>
            <MerchantLabel merchant={r.merchant} />
          </div>
          <div className="tabular text-3xl font-semibold">{usd(r.amountCents)}</div>
        </div>
        <ul className="mt-3 space-y-1 text-sm text-ink-2">
          {r.items.map((i, n) => (
            <li key={n} className="flex justify-between gap-3">
              <span>
                {i.quantity}× {i.name} · <span className="text-ink-3">{titleCase(i.category)}</span>
              </span>
              <span className="tabular">{usd(Math.round(i.unitPrice * 100) * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">
          <span className="font-medium">Agent&apos;s stated purpose:</span> {r.purpose}
        </p>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold">1 · Rules engine (deterministic)</h3>
        <ul className="space-y-1.5">
          {r.policyChecks.map((c, n) => {
            const { icon: Icon, cls } = OUTCOME_STYLE[c.outcome];
            return (
              <li key={n} className="flex items-start gap-2 text-sm">
                <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', cls)} aria-hidden="true" />
                <span>
                  {c.detail} <span className="font-mono text-xs text-ink-3">{c.rule}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-ink-3">Engine verdict: {titleCase(r.policyDecision)}</p>
      </section>

      {r.audit && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            2 · AI auditor <span className="font-normal text-ink-3">(can only make decisions stricter)</span>
          </h3>
          <div className={clsx('rounded-xl p-3 text-sm', r.audit.verdict === 'consistent' ? 'bg-surface-2' : 'bg-ai-soft')}>
            <div className="flex items-center gap-2">
              <RiskBadge audit={r.audit} />
              <span className="font-medium">{titleCase(r.audit.verdict)}</span>
              <span className="ml-auto font-mono text-xs text-ink-3">{r.audit.model}</span>
            </div>
            <p className="mt-2">{r.audit.explanation}</p>
            {r.audit.signals.length > 0 && (
              <ul className="mt-2 space-y-1">
                {r.audit.signals.map((s) => (
                  <li key={s} className="flex items-start gap-2 text-ai">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold">3 · Decision</h3>
        <p className="text-sm">
          <span className="font-medium">{titleCase(r.decision)}</span> · decided by {finalBy}
        </p>
      </section>

      {(r.paypalOrderId || r.error) && (
        <section>
          <h3 className="mb-1 text-sm font-semibold">4 · PayPal</h3>
          <div className="divide-y divide-line">
            <Mono label="Order (Orders v2, vaulted wallet)" value={r.paypalOrderId} />
            <Mono label="Capture" value={r.captureId} />
            <Mono label="Merchant payout batch" value={r.payoutBatchId} />
            <Mono label="Payout status" value={r.payoutStatus} />
            <Mono label="Payout fee" value={r.payoutFeeCents != null ? usd(r.payoutFeeCents) : null} />
            <Mono label="Refund" value={r.refundId} />
          </div>
          {r.error && <p className="mt-2 text-sm text-deny">{r.error}</p>}
        </section>
      )}

      {['paid', 'settled'].includes(r.status) && (
        <div>
          <Button variant="secondary" onClick={doRefund} disabled={refunding}>
            {refunding ? <Spinner /> : <Undo2 className="h-4 w-4" aria-hidden="true" />} Refund to my PayPal
          </Button>
          {error && <p className="mt-2 text-sm text-deny">{error}</p>}
        </div>
      )}
    </div>
  );
}
