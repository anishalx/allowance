'use client';

import { Bell, Bot, Plus, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ActivityFeed } from '@/components/activity-feed';
import { AgentCard } from '@/components/agent-card';
import { Drawer } from '@/components/drawer';
import { OperationApprovalCard, OperationRow, OperationTrace } from '@/components/operation-views';
import { ApprovalCard, DecisionTrace, MerchantLabel, RiskBadge } from '@/components/request-views';
import { Card, SectionTitle, Spinner, StatusChip } from '@/components/ui';
import { api, useDashboard } from '@/components/use-dashboard';
import { WalletCard } from '@/components/wallet-card';
import { useSearchParam } from '@/components/use-location';
import { DemoBanner } from '@/components/demo-banner';
import { timeAgo, usd } from '@/lib/format';

const LINK_MESSAGES: Record<string, { text: string; tone: 'allow' | 'deny' }> = {
  ok: { text: 'PayPal wallet linked. Your agents can now spend within their rules.', tone: 'allow' },
  cancelled: { text: 'Linking was cancelled on PayPal.', tone: 'deny' },
  failed: { text: 'PayPal approved, but saving the wallet failed. Try again.', tone: 'deny' },
  missing: { text: 'That PayPal approval link has expired. Start again.', tone: 'deny' },
};

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-ink-2">{label}</div>
      <div className={`tabular mt-1 text-2xl font-semibold tracking-tight ${tone ?? ''}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-3">{hint}</div>}
    </Card>
  );
}

function PhonePush({ topic, onSaved }: { topic: string | null; onSaved: () => void }) {
  const [value, setValue] = useState(topic ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api('/api/settings', { method: 'PATCH', json: { ntfyTopic: value.trim() || null } });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Bell className="h-4 w-4 text-ink-2" aria-hidden="true" /> Approvals on your phone
      </div>
      <p className="mt-1 text-xs text-ink-2">
        Install the free <a className="underline" href="https://ntfy.sh" target="_blank" rel="noreferrer">ntfy</a> app, subscribe to a private topic name, and paste it here. Approve or deny with one tap.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. allowance-7f3k2"
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-brand"
          aria-label="ntfy topic"
        />
        <button type="button" onClick={save} disabled={saving} className="h-9 rounded-lg bg-ink px-3 text-sm text-canvas disabled:opacity-50">
          {saving ? <Spinner /> : 'Save'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-deny">{error}</p>}
    </Card>
  );
}

export default function DashboardPage() {
  const { state, error, live, refresh } = useDashboard();
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedOp, setSelectedOp] = useState<string | null>(null);
  // After PayPal sends the human back from linking a wallet (?link=ok|failed|missing).
  const link = useSearchParam('link');
  const [linkDismissed, setLinkDismissed] = useState(false);
  const linkMsg = link && !linkDismissed ? (LINK_MESSAGES[link] ?? null) : null;


  const agentName = useMemo(() => new Map(state?.agents.map((a) => [a.id, a.name]) ?? []), [state]);
  const pending = state?.requests.filter((r) => r.status === 'pending_approval') ?? [];
  const pendingOps = state?.operations.filter((o) => o.status === 'pending_approval') ?? [];
  const selectedRequest = state?.requests.find((r) => r.id === selected) ?? null;
  const selectedOperation = state?.operations.find((o) => o.id === selectedOp) ?? null;
  // Activity rows link to either a purchase or a business action.
  const openActivity = (id: string) => (id.startsWith('op_') ? setSelectedOp(id) : setSelected(id));

  if (!state) {
    return <div className="flex items-center gap-2 text-ink-2">{error ? <span className="text-deny">{error}</span> : <><Spinner /> Loading…</>}</div>;
  }

  return (
    <div className="space-y-8">
      <DemoBanner household={state.household} onReset={refresh} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your agents&apos; allowance</h1>
          <p className="mt-1 text-sm text-ink-2">
            Every purchase passes your rules and an AI auditor before PayPal moves money.{' '}
            <span className={live ? 'text-allow' : 'text-ink-3'}>{live ? '● Live' : '○ Reconnecting…'}</span>
          </p>
        </div>
        <Link href="/playground" className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-canvas hover:opacity-90">
          <Bot className="h-4 w-4" aria-hidden="true" /> Run an agent
        </Link>
      </div>

      {linkMsg && (
        <div className={`flex items-start justify-between gap-3 rounded-xl p-3 text-sm ${linkMsg.tone === 'allow' ? 'bg-allow-soft text-allow' : 'bg-deny-soft text-deny'}`}>
          {linkMsg.text}
          <button
            type="button"
            aria-label="Dismiss"
            className="opacity-70 hover:opacity-100"
            onClick={() => {
              setLinkDismissed(true);
              window.history.replaceState(null, '', '/dashboard');
            }}
          >
            ×
          </button>
        </div>
      )}

      {pending.length + pendingOps.length > 0 && (
        <section>
          <SectionTitle>Waiting for you ({pending.length + pendingOps.length})</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            {pending.map((r) => (
              <ApprovalCard key={r.id} request={r} agentName={agentName.get(r.agentId) ?? 'Agent'} onDone={refresh} />
            ))}
            {pendingOps.map((o) => (
              <OperationApprovalCard key={o.id} op={o} agentName={agentName.get(o.agentId) ?? 'Agent'} onDone={refresh} />
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
        <WalletCard wallet={state.wallet} onChanged={refresh} />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Spent by agents" value={usd(state.stats.spentCents)} hint={`${state.stats.autoApproved} auto · ${state.stats.humanApproved} approved by you`} />
          <Stat label="Blocked" value={usd(state.stats.blockedCents)} hint={`${state.stats.blocked} purchase${state.stats.blocked === 1 ? '' : 's'} stopped`} tone="text-deny" />
          <Stat label="Caught by AI auditor" value={String(state.stats.caughtByAuditor)} hint="rules alone would have missed" tone="text-ai" />
          <Stat label="Agents" value={String(state.agents.length)} hint={`${state.agents.filter((a) => a.status === 'frozen').length} frozen`} />
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section>
          <SectionTitle
            action={
              <Link href="/agents/new" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
                <Plus className="h-4 w-4" aria-hidden="true" /> New agent
              </Link>
            }
          >
            Agents
          </SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {state.agents.map((a) => (
              <AgentCard key={a.id} agent={a} onChanged={refresh} />
            ))}
          </div>

          <div className="mt-8">
            <SectionTitle>Purchase requests</SectionTitle>
            <Card className="divide-y divide-line">
              {state.requests.length === 0 && <p className="p-5 text-sm text-ink-3">No purchases yet.</p>}
              {state.requests.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelected(r.id)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{agentName.get(r.agentId)}</span>
                      <span className="text-ink-3">→</span>
                      <MerchantLabel merchant={r.merchant} />
                    </div>
                    <div className="mt-0.5 truncate text-xs text-ink-3">
                      {r.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')} · {timeAgo(r.createdAt)}
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    <RiskBadge audit={r.audit} />
                  </div>
                  <StatusChip status={r.status} decidedBy={r.decidedBy} />
                  <div className="tabular w-20 text-right text-sm font-medium">{usd(r.amountCents)}</div>
                </button>
              ))}
            </Card>
          </div>

          {state.operations.length > 0 && (
            <div className="mt-8">
              <SectionTitle>Actions on your PayPal account</SectionTitle>
              <Card className="divide-y divide-line">
                {state.operations.map((o) => (
                  <OperationRow key={o.id} op={o} agentName={agentName.get(o.agentId) ?? 'Agent'} onClick={() => setSelectedOp(o.id)} />
                ))}
              </Card>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <PhonePush key={state.user.ntfyTopic ?? ''} topic={state.user.ntfyTopic} onSaved={refresh} />
          <div>
            <SectionTitle>
              <span className="inline-flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Activity
              </span>
            </SectionTitle>
            <Card className="max-h-[640px] overflow-y-auto p-4">
              <ActivityFeed events={state.events} onSelect={openActivity} />
            </Card>
          </div>
        </aside>
      </div>

      <Drawer open={!!selectedOperation} onClose={() => setSelectedOp(null)} title="How Allowance decided">
        {selectedOperation && <OperationTrace op={selectedOperation} agentName={agentName.get(selectedOperation.agentId) ?? 'Agent'} />}
      </Drawer>

      <Drawer open={!!selectedRequest} onClose={() => setSelected(null)} title="How Allowance decided">
        {selectedRequest && <DecisionTrace request={selectedRequest} agentName={agentName.get(selectedRequest.agentId) ?? 'Agent'} onChanged={refresh} />}
      </Drawer>
    </div>
  );
}
