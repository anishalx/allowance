'use client';

import clsx from 'clsx';
import { Ban, Check, CircleAlert, Clock, FileText, Gavel, ShieldAlert, Sparkles, Undo2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DashboardOperation } from '@/lib/dashboard';
import { timeAgo, titleCase, usd } from '@/lib/format';
import { RiskBadge } from './request-views';
import { api } from './use-dashboard';
import { Button, Chip, Spinner, StatusChip } from './ui';

export const OP_LABEL: Record<string, { label: string; icon: typeof Undo2 }> = {
  refund: { label: 'Refund', icon: Undo2 },
  invoice: { label: 'Invoice', icon: FileText },
  accept_dispute: { label: 'Accept dispute', icon: Gavel },
};

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

export function OperationApprovalCard({ op, agentName, token, onDone }: { op: DashboardOperation; agentName: string; token?: string; onDone?: () => void }) {
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const countdown = useCountdown(op.approvalExpiresAt);
  const { label, icon: Icon } = OP_LABEL[op.kind] ?? OP_LABEL.refund;
  const asks = op.checks.filter((c) => c.outcome === 'approval').map((c) => c.detail);

  async function decide(action: 'approve' | 'deny') {
    setBusy(action);
    setError(null);
    try {
      await api(`/api/operations/${op.id}/decision`, { method: 'POST', json: { action, token } });
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
            <span className="font-semibold text-ink">{agentName}</span> wants to act on your PayPal account
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-sm font-medium">
            <Icon className="h-4 w-4" aria-hidden="true" /> {label} · <span className="font-normal text-ink-2">{op.target}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="tabular text-3xl font-semibold tracking-tight">{usd(op.amountCents)}</div>
          {countdown && (
            <div className="mt-1 inline-flex items-center gap-1 text-xs text-ink-3">
              <Clock className="h-3 w-3" aria-hidden="true" /> expires in {countdown}
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-sm text-ink-2">
        <span className="font-medium text-ink">Agent says:</span> “{op.reason}”
      </p>
      <div className="mt-3 space-y-2 text-sm">
        {asks.map((a) => (
          <div key={a} className="flex items-start gap-2 text-ask">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{a}</span>
          </div>
        ))}
        {op.audit && op.audit.verdict !== 'consistent' && (
          <div className="flex items-start gap-2 text-ai">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-medium">AI auditor (risk {op.audit.riskScore}):</span> {op.audit.explanation}
            </span>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-ink-3">If approved, runs PayPal Agent Toolkit: {op.paypalTool}</p>
      {error && <p className="mt-3 text-sm text-deny">{error}</p>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="secondary" size="lg" className="px-3 whitespace-nowrap" disabled={!!busy} onClick={() => decide('deny')}>
          {busy === 'deny' ? <Spinner /> : <X className="h-4 w-4" aria-hidden="true" />} Deny
        </Button>
        <Button variant="allow" size="lg" className="px-3 whitespace-nowrap" disabled={!!busy} onClick={() => decide('approve')}>
          {busy === 'approve' ? <Spinner /> : <Check className="h-4 w-4" aria-hidden="true" />} Approve
        </Button>
      </div>
    </div>
  );
}

export function OperationRow({ op, agentName, onClick }: { op: DashboardOperation; agentName: string; onClick: () => void }) {
  const { label, icon: Icon } = OP_LABEL[op.kind] ?? OP_LABEL.refund;
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-surface-2">
      <span className="rounded-lg bg-surface-2 p-2 text-ink-2">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm">
          <span className="font-medium">{agentName}</span> <span className="text-ink-3">·</span> {label}
        </div>
        <div className="mt-0.5 truncate text-xs text-ink-3">
          {op.target} · {timeAgo(op.createdAt)}
        </div>
      </div>
      <div className="hidden sm:block">
        <RiskBadge audit={op.audit} />
      </div>
      <StatusChip status={op.status} decidedBy={op.decidedBy} />
      <div className="tabular w-20 text-right text-sm font-medium">{usd(op.amountCents)}</div>
    </button>
  );
}

const OUTCOME = {
  pass: { icon: Check, cls: 'text-allow' },
  approval: { icon: CircleAlert, cls: 'text-ask' },
  deny: { icon: Ban, cls: 'text-deny' },
} as const;

export function OperationTrace({ op, agentName }: { op: DashboardOperation; agentName: string }) {
  const finalBy = { policy: 'Rules engine', auditor: 'AI auditor', human: 'You', timeout: 'Timed out' }[op.decidedBy];
  const { label } = OP_LABEL[op.kind] ?? OP_LABEL.refund;
  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={op.status} decidedBy={op.decidedBy} />
          <Chip>PayPal Agent Toolkit · {op.paypalTool}</Chip>
          <span className="text-xs text-ink-3">{timeAgo(op.createdAt)}</span>
        </div>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <div className="text-sm text-ink-2">
              {agentName} · {label}
            </div>
            <div className="font-medium">{op.target}</div>
          </div>
          <div className="tabular text-3xl font-semibold">{usd(op.amountCents)}</div>
        </div>
        <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">
          <span className="font-medium">Agent&apos;s stated reason:</span> {op.reason}
        </p>
      </div>
      <section>
        <h3 className="mb-2 text-sm font-semibold">1 · Rules engine (facts from PayPal)</h3>
        <ul className="space-y-1.5">
          {op.checks.map((c, n) => {
            const { icon: I, cls } = OUTCOME[c.outcome];
            return (
              <li key={n} className="flex items-start gap-2 text-sm">
                <I className={clsx('mt-0.5 h-4 w-4 shrink-0', cls)} aria-hidden="true" />
                <span>
                  {c.detail} <span className="font-mono text-xs text-ink-3">{c.rule}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-ink-3">Engine verdict: {titleCase(op.engineDecision)}</p>
      </section>
      {op.audit && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">
            2 · AI auditor <span className="font-normal text-ink-3">(can only make decisions stricter)</span>
          </h3>
          <div className={clsx('rounded-xl p-3 text-sm', op.audit.verdict === 'consistent' ? 'bg-surface-2' : 'bg-ai-soft')}>
            <div className="flex items-center gap-2">
              <RiskBadge audit={op.audit} />
              <span className="font-medium">{titleCase(op.audit.verdict)}</span>
            </div>
            <p className="mt-2">{op.audit.explanation}</p>
            {op.audit.signals.length > 0 && (
              <ul className="mt-2 space-y-1">
                {op.audit.signals.map((s) => (
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
          <span className="font-medium">{titleCase(op.decision)}</span> · decided by {finalBy}
        </p>
      </section>
      {(op.result || op.error) && (
        <section>
          <h3 className="mb-1 text-sm font-semibold">4 · PayPal</h3>
          {op.result && (
            <dl className="divide-y divide-line text-sm">
              {Object.entries(op.result).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-1.5">
                  <dt className="text-ink-2">{titleCase(k.replace(/([A-Z])/g, '_$1').toLowerCase())}</dt>
                  <dd className="truncate font-mono text-xs">{String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          {op.error && <p className="mt-2 text-sm text-deny">{op.error}</p>}
        </section>
      )}
    </div>
  );
}
