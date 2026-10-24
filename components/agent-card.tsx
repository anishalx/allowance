'use client';

import clsx from 'clsx';
import { Pause, Pencil, Play, PlugZap } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { DashboardAgent } from '@/lib/dashboard';
import { dollarsToCents, titleCase } from '@/lib/format';
import { api } from './use-dashboard';
import { Button, Card, Chip, Meter, Spinner } from './ui';

export function AgentCard({ agent, onChanged }: { agent: DashboardAgent; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const frozen = agent.status === 'frozen';
  const a = agent.allowance;

  async function toggle() {
    setBusy(true);
    try {
      await api(`/api/agents/${agent.id}`, { method: 'PATCH', json: { status: frozen ? 'active' : 'frozen' } });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const windows = [
    ['Today', a.daily],
    ['This week', a.weekly],
    ['This month', a.monthly],
  ] as const;

  return (
    <Card className={clsx('flex flex-col p-5', frozen && 'opacity-75')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{agent.name}</h3>
            {frozen ? <Chip tone="deny">Frozen</Chip> : <Chip tone="allow">Active</Chip>}
            {agent.kind === 'business' && <Chip tone="ai">Operates your PayPal</Chip>}
          </div>
          <p className="mt-0.5 text-sm text-ink-2">{agent.role}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={toggle} disabled={busy} aria-label={frozen ? 'Unfreeze agent' : 'Freeze agent'}>
          {busy ? <Spinner /> : frozen ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          {frozen ? 'Unfreeze' : 'Freeze'}
        </Button>
      </div>

      <p className="mt-4 rounded-lg bg-surface-2 p-3 text-sm">“{agent.mandateText}”</p>

      {agent.kind === 'business' && agent.opsPolicy ? (
        <BusinessRules agent={agent} />
      ) : (
        <>
          <div className="mt-4 space-y-3">
            {windows.map(([label, w]) => (w ? <Meter key={label} label={label} spent={dollarsToCents(w.spent)} limit={dollarsToCents(w.limit)} /> : null))}
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
            {a.autoApproveUpTo && <Chip tone="allow">Auto-approves up to {a.autoApproveUpTo}</Chip>}
            {a.perPurchaseMax && <Chip>Max {a.perPurchaseMax} each</Chip>}
            {a.blockedCategories.slice(0, 4).map((c) => (
              <Chip key={c} tone="deny">
                No {titleCase(c).toLowerCase()}
              </Chip>
            ))}
            {a.blockedCategories.length > 4 && <Chip tone="deny">+{a.blockedCategories.length - 4} more blocked</Chip>}
          </div>
        </>
      )}

      <div className="mt-5 flex gap-2 border-t border-line pt-4">
        <Link href={`/agents/${agent.id}`} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
          <Pencil className="h-4 w-4" aria-hidden="true" /> Edit rules <span className="text-xs text-ink-3">v{agent.policyVersion}</span>
        </Link>
        <Link href={`/connect?agent=${agent.id}`} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
          <PlugZap className="h-4 w-4" aria-hidden="true" /> Connect
        </Link>
      </div>
    </Card>
  );
}

// A business agent works the merchant's PayPal account (via PayPal's Agent Toolkit) instead of spending a wallet.
function BusinessRules({ agent }: { agent: DashboardAgent }) {
  const p = agent.opsPolicy!;
  const refunds = agent.ops && typeof agent.ops.refunds === 'object' ? agent.ops.refunds : null;
  const money = (n: number | null) => (n === null ? null : `$${n % 1 ? n.toFixed(2) : n}`);
  return (
    <>
      {refunds && p.refunds.dailyMax !== null && (
        <div className="mt-4">
          <Meter label="Refunded today" spent={dollarsToCents(refunds.refundedLast24h)} limit={dollarsToCents(String(p.refunds.dailyMax))} />
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
        {p.refunds.enabled ? (
          <>
            {p.refunds.perRefundMax !== null && <Chip>Refunds ≤ {money(p.refunds.perRefundMax)} each</Chip>}
            {p.refunds.maxOrderAgeDays !== null && <Chip>Orders from last {p.refunds.maxOrderAgeDays} days</Chip>}
            {p.refunds.fullRefundsNeedApproval && <Chip tone="ask">Asks before full refunds</Chip>}
          </>
        ) : (
          <Chip tone="deny">No refunds</Chip>
        )}
        {p.invoices.enabled ? (
          <>
            {p.invoices.perInvoiceMax !== null && <Chip>Invoices ≤ {money(p.invoices.perInvoiceMax)}</Chip>}
            {p.invoices.onlyExistingCustomers && <Chip tone="ask">Existing customers only</Chip>}
          </>
        ) : (
          <Chip tone="deny">No invoices</Chip>
        )}
        <Chip tone={p.disputes.acceptClaims === 'never' ? 'deny' : 'ask'}>{p.disputes.acceptClaims === 'never' ? 'Never accepts disputes' : 'Asks before accepting disputes'}</Chip>
      </div>
    </>
  );
}
