'use client';

import { ArrowRight, Braces, CircleAlert, ShieldPlus, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CompiledMandate, CompiledOpsMandate } from '@/lib/ai/compiler';
import type { OpsPolicy } from '@/lib/ops/schema';
import { titleCase } from '@/lib/format';
import type { Policy } from '@/lib/policy/schema';
import { api } from './use-dashboard';
import { Button, Card, Chip, SectionTitle, Spinner } from './ui';

const money = (n: number | null) => (n === null ? '—' : `$${n.toFixed(2)}`);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-2 text-sm">
      <dt className="text-ink-2">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function PolicyView({ policy }: { policy: Policy }) {
  const chips = (list: string[], tone: 'allow' | 'deny' | 'ask') =>
    list.length ? (
      <div className="flex flex-wrap gap-1">
        {list.map((c) => (
          <Chip key={c} tone={tone}>
            {titleCase(c)}
          </Chip>
        ))}
      </div>
    ) : (
      <span className="text-ink-3">none</span>
    );
  return (
    <dl className="divide-y divide-line">
      <Row label="Per purchase">{money(policy.limits.perPurchaseMax)}</Row>
      <Row label="Rolling limits">
        day {money(policy.limits.daily)} · week {money(policy.limits.weekly)} · month {money(policy.limits.monthly)}
      </Row>
      <Row label="Ask me">
        {policy.approval.requireAbove !== null ? `above ${money(policy.approval.requireAbove)}` : 'never by amount'}
        {policy.approval.newMerchants && ' · first purchase at any merchant'}
      </Row>
      <Row label="Allowed">{policy.categories.allowed ? chips(policy.categories.allowed, 'allow') : <span>any category not blocked</span>}</Row>
      <Row label="Blocked">{chips(policy.categories.blocked, 'deny')}</Row>
      <Row label="Always ask for">{chips(policy.categories.approvalRequired, 'ask')}</Row>
      {policy.categories.budgets.length > 0 && (
        <Row label="Budgets">
          {policy.categories.budgets.map((b) => `${titleCase(b.category)}: ${money(b.max)}/${b.period}`).join(' · ')}
        </Row>
      )}
      <Row label="Merchants">
        {policy.merchants.allowed ? `only ${policy.merchants.allowed.join(', ')}` : 'any verified merchant'}
        {policy.merchants.blocked.length > 0 && ` · never ${policy.merchants.blocked.join(', ')}`}
      </Row>
      {policy.quietHours && (
        <Row label="Quiet hours">
          {policy.quietHours.start}–{policy.quietHours.end} {policy.quietHours.timezone} ({policy.quietHours.action === 'deny' ? 'blocked' : 'ask me'})
        </Row>
      )}
      {policy.notes.length > 0 && <Row label="For the AI auditor">{policy.notes.join(' · ')}</Row>}
    </dl>
  );
}

export function OpsPolicyView({ policy }: { policy: OpsPolicy }) {
  const r = policy.refunds;
  const i = policy.invoices;
  return (
    <dl className="divide-y divide-line">
      <Row label="Refunds">
        {r.enabled ? (
          <>
            up to {money(r.perRefundMax)} each · {money(r.dailyMax)} a day
            {r.maxOrderAgeDays !== null && ` · orders from the last ${r.maxOrderAgeDays} days`}
            {r.requireAbove !== null && ` · ask me above ${money(r.requireAbove)}`}
            {r.fullRefundsNeedApproval && ' · ask me before full refunds'}
          </>
        ) : (
          'not allowed'
        )}
      </Row>
      <Row label="Invoices">
        {i.enabled ? (
          <>
            up to {money(i.perInvoiceMax)} · {i.dailyCount ?? 'unlimited'} a day
            {i.requireAbove !== null && ` · ask me above ${money(i.requireAbove)}`}
            {i.onlyExistingCustomers && ' · existing customers only'}
          </>
        ) : (
          'not allowed'
        )}
      </Row>
      <Row label="Disputes">{policy.disputes.acceptClaims === 'never' ? 'never accept a claim' : 'ask me before accepting a claim'}</Row>
      {policy.notes.length > 0 && <Row label="For the AI auditor">{policy.notes.join(' · ')}</Row>}
    </dl>
  );
}

type Props =
  | { mode: 'new' }
  | { mode: 'edit'; agent: { id: string; name: string; role: string; mandateText: string; policy: Policy; policyVersion: number; kind: 'shopper' | 'business'; opsPolicy: OpsPolicy | null } };

export function MandateEditor(props: Props) {
  const router = useRouter();
  const editing = props.mode === 'edit' ? props.agent : null;
  const [name, setName] = useState(editing?.name ?? '');
  const [role, setRole] = useState(editing?.role ?? '');
  const [kind, setKind] = useState<'shopper' | 'business'>(editing?.kind ?? 'shopper');
  const [text, setText] = useState(editing?.mandateText ?? '');
  const [compiled, setCompiled] = useState<CompiledMandate | CompiledOpsMandate | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [busy, setBusy] = useState<'compile' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);

  async function compile() {
    setBusy('compile');
    setError(null);
    try {
      setCompiled(
        await api<CompiledMandate | CompiledOpsMandate>('/api/mandates/compile', {
          method: 'POST',
          json: { agentName: name, agentRole: role, text, kind, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!compiled) return;
    setBusy('save');
    setError(null);
    try {
      if (editing) {
        await api(`/api/agents/${editing.id}`, { method: 'PATCH', json: { mandateText: text, ...(kind === 'business' ? { opsPolicy: compiled.policy } : { policy: compiled.policy }) } });
        router.push('/dashboard');
      } else {
        const { apiKey } = await api<{ apiKey: string }>('/api/agents', {
          method: 'POST',
          json: { name, role, kind, mandateText: text, ...(kind === 'business' ? { opsPolicy: compiled.policy } : { policy: compiled.policy }) },
        });
        setNewKey(apiKey);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (newKey) {
    return (
      <Card className="max-w-2xl p-6">
        <h2 className="text-lg font-semibold">{name} is ready</h2>
        <p className="mt-1 text-sm text-ink-2">This is its API key. It is shown only once; Allowance stores just a hash.</p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-sm">{newKey}</pre>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => navigator.clipboard.writeText(newKey)} variant="secondary">
            Copy key
          </Button>
          <Button onClick={() => router.push('/connect')}>
            Connect it <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        {!editing && (
          <>
            <div>
              <div className="text-sm font-medium">Kind of agent</div>
              <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1" role="radiogroup" aria-label="Kind of agent">
                {(
                  [
                    ['shopper', 'Spends a wallet', 'Buys things with your linked PayPal'],
                    ['business', 'Operates your PayPal', "Refunds and invoices via PayPal's Agent Toolkit"],
                  ] as const
                ).map(([k, label, hint]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => {
                      setKind(k);
                      setCompiled(null);
                    }}
                    className={`rounded-md px-3 py-2 text-left text-xs ${kind === k ? 'bg-surface font-medium text-ink shadow-card' : 'text-ink-2 hover:text-ink'}`}
                  >
                    <div className="text-sm">{label}</div>
                    <div className="font-normal text-ink-3">{hint}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="name" className="text-sm font-medium">
                Agent name
              </label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pantry" className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label htmlFor="role" className="text-sm font-medium">
                What is it for?
              </label>
              <input id="role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Keeps our kitchen stocked with groceries" className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-brand" />
              <p className="mt-1 text-xs text-ink-3">The AI auditor checks every purchase against this.</p>
            </div>
          </>
        )}
        {editing && (
          <div>
            <div className="text-lg font-semibold">{editing.name}</div>
            <div className="text-sm text-ink-2">{editing.role}</div>
          </div>
        )}
        <div>
          <label htmlFor="rules" className="text-sm font-medium">
            Rules, in your own words
          </label>
          <textarea
            id="rules"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCompiled(null);
            }}
            rows={6}
            placeholder="Groceries only, up to $60 a week. Ask me for anything over $25. Never alcohol. No purchases after 10pm."
            className="mt-1 w-full rounded-lg border border-line bg-surface p-3 text-sm outline-none focus:border-brand"
          />
        </div>
        {error && <p className="text-sm text-deny">{error}</p>}
        <Button onClick={compile} disabled={busy !== null || !name.trim() || role.trim().length < 3 || text.trim().length < 3} className="w-full" size="lg">
          {busy === 'compile' ? <Spinner /> : <Sparkles className="h-4 w-4" aria-hidden="true" />} Turn into rules
        </Button>
        <p className="text-xs text-ink-3">
          The AI writes the rules; it never enforces them. A deterministic engine does, and you approve the result first.
        </p>
      </Card>

      <div className="space-y-4">
        {!compiled && editing && (
          <Card className="p-5">
            <SectionTitle>Current rules (v{editing.policyVersion})</SectionTitle>
            <p className="mb-3 text-sm">{editing.policy.summary}</p>
            {editing.kind === 'business' && editing.opsPolicy ? <OpsPolicyView policy={editing.opsPolicy} /> : <PolicyView policy={editing.policy} />}
          </Card>
        )}
        {!compiled && !editing && <Card className="p-5 text-sm text-ink-3">The compiled rules appear here for you to review.</Card>}
        {compiled && (
          <>
            <Card className="slide-in p-5">
              <SectionTitle>How I understood you</SectionTitle>
              <ol className="space-y-2">
                {compiled.interpretation.map((i, n) => (
                  <li key={n} className="grid grid-cols-[minmax(0,1fr)_16px_minmax(0,1.3fr)] items-start gap-2 text-sm">
                    <span className="text-ink-2">{i.said}</span>
                    <ArrowRight className="mt-0.5 h-4 w-4 text-ink-3" aria-hidden="true" />
                    <span>{i.rule}</span>
                  </li>
                ))}
              </ol>
              {compiled.safetyDefaults.length > 0 && (
                <div className="mt-4 rounded-xl bg-ai-soft p-3 text-sm text-ai">
                  <div className="flex items-center gap-1.5 font-medium">
                    <ShieldPlus className="h-4 w-4" aria-hidden="true" /> Safety rules I added
                  </div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {compiled.safetyDefaults.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {compiled.ambiguities.length > 0 && (
                <div className="mt-3 rounded-xl bg-ask-soft p-3 text-sm text-ask">
                  <div className="flex items-center gap-1.5 font-medium">
                    <CircleAlert className="h-4 w-4" aria-hidden="true" /> Double-check
                  </div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {compiled.ambiguities.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
            <Card className="slide-in p-5">
              <SectionTitle
                action={
                  <button type="button" onClick={() => setShowJson((v) => !v)} className="inline-flex items-center gap-1 text-xs text-ink-2 hover:text-ink">
                    <Braces className="h-3.5 w-3.5" aria-hidden="true" /> {showJson ? 'Hide' : 'Show'} JSON
                  </button>
                }
              >
                Rules the engine will enforce
              </SectionTitle>
              <p className="mb-3 text-sm">{compiled.policy.summary}</p>
              {showJson ? <pre className="max-h-96 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-xs">{JSON.stringify(compiled.policy, null, 2)}</pre> : 'refunds' in compiled.policy ? <OpsPolicyView policy={compiled.policy} /> : <PolicyView policy={compiled.policy} />}
              <Button onClick={save} disabled={busy !== null} className="mt-5 w-full" size="lg" variant="allow">
                {busy === 'save' ? <Spinner /> : null} {editing ? 'Save new rules' : `Create ${name || 'agent'}`}
              </Button>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
