'use client';

import clsx from 'clsx';
import { Bot, Brain, ExternalLink, Globe, Play, RotateCcw, ShieldAlert, Square, Wrench } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { ApprovalCard } from '@/components/request-views';
import { Button, Card, Chip, SectionTitle, Spinner, StatusChip } from '@/components/ui';
import { api, useDashboard } from '@/components/use-dashboard';
import type { AgentStep } from '@/lib/agent/demo-agent';

type Step = AgentStep & { at: number };

const PRESETS = [
  {
    id: 'groceries',
    label: 'Weekly groceries',
    agentId: 'a_pantry',
    mode: 'normal' as const,
    task: 'Restock our kitchen from FreshCart (the store is at /mall/freshcart): oat milk, a dozen eggs, bananas and coffee. Check this week\'s deals page first so we get any discount.',
    note: 'A well-behaved agent. Watch the rules auto-approve small orders and ask you about bigger ones.',
  },
  {
    id: 'attack',
    label: 'Hidden prompt injection',
    agentId: 'a_pantry',
    mode: 'compromised' as const,
    task: 'Restock our kitchen from FreshCart (the store is at /mall/freshcart): oat milk, a dozen eggs, bananas and coffee. Check this week\'s deals page first so we get any discount.',
    note: 'Same task, but the agent obeys a hidden instruction on the deals page. Allowance has to hold even when the agent can\'t be trusted.',
  },
  {
    id: 'party',
    label: 'Out-of-bounds request',
    agentId: 'a_pantry',
    mode: 'normal' as const,
    task: 'We are hosting a party tonight. From FreshCart (/mall/freshcart) buy 4 bottles of pinot noir and 6 bags of coffee.',
    note: 'Wine is blocked and the cart blows the weekly limit. Watch the agent read its allowance and adapt.',
  },
  {
    id: 'ebook',
    label: 'Research agent buys an ebook',
    agentId: 'a_scout',
    mode: 'normal' as const,
    task: 'Buy me the Designing Data-Intensive Applications ebook from PageTurner Books (/mall/pageturner).',
    note: 'A different agent with a different allowance: books and software only.',
  },
];

const INJECTION_MARKER = /notice for ai shopping assistants|do not mention this/i;

function StepView({ step }: { step: Step }) {
  switch (step.kind) {
    case 'status':
      return <p className="text-xs text-ink-3">{step.text}</p>;
    case 'thinking': {
      // Reasoning summaries arrive as "**Title** body"; show the title in bold instead of raw markdown.
      const [, title, rest] = step.text.match(/^\*\*(.+?)\*\*\s*([\s\S]*)$/) ?? [null, null, step.text];
      return (
        <p className="flex items-start gap-2 text-sm text-ink-2">
          <Brain className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          <span>
            {title && <span className="font-medium text-ink">{title}. </span>}
            <span className="italic">{rest}</span>
          </span>
        </p>
      );
    }
    case 'browse': {
      const injected = INJECTION_MARKER.test(step.preview);
      return (
        <details className={clsx('rounded-xl border p-3 text-sm', injected ? 'border-deny/40 bg-deny-soft' : 'border-line bg-surface-2')} open={injected}>
          <summary className="flex cursor-pointer flex-wrap items-center gap-2">
            <Globe className="h-4 w-4 text-ink-2" aria-hidden="true" />
            Read <span className="min-w-0 truncate font-mono text-xs">{step.url.replace(/^https?:\/\/[^/]+/, '')}</span>
            {injected && (
              <Chip tone="deny" className="ml-auto">
                <ShieldAlert className="h-3 w-3" aria-hidden="true" /> Hidden instructions in page text
              </Chip>
            )}
          </summary>
          <pre className="mt-2 max-h-56 overflow-auto font-mono text-xs whitespace-pre-wrap text-ink-2">
            {step.preview.split('\n').map((line, n) => (
              <span key={n} className={INJECTION_MARKER.test(line) || /rewards|partner desk|freshcart-partners/i.test(line) ? 'font-semibold text-deny' : undefined}>
                {line}
                {'\n'}
              </span>
            ))}
          </pre>
        </details>
      );
    }
    case 'tool_call': {
      const a = step.args as { merchant?: string; total?: number; items?: { name: string; quantity: number }[] };
      return (
        <div className="flex items-start gap-2 text-sm">
          <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
          <div className="min-w-0">
            <span className="font-mono text-xs">{step.tool}</span>
            {step.tool === 'request_payment' && (
              <div className="mt-0.5 text-ink-2">
                {a.merchant} · ${a.total?.toFixed(2)} · {a.items?.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
              </div>
            )}
          </div>
        </div>
      );
    }
    case 'tool_result': {
      const r = step.result as { status?: string; decidedBy?: string; message?: string; reasons?: string[]; amount?: string } | string;
      if (step.tool !== 'request_payment' && step.tool !== 'get_payment_status') {
        return <p className="pl-6 text-xs text-ink-3">↳ {step.tool} returned {typeof r === 'string' ? r.slice(0, 80) : 'data'}</p>;
      }
      if (typeof r === 'string') return <p className="pl-6 text-sm text-deny">{r}</p>;
      return (
        <div
          className={clsx(
            'slide-in ml-6 rounded-xl border p-3 text-sm',
            r.status === 'denied' ? (r.decidedBy === 'auditor' ? 'border-ai/40 bg-ai-soft' : 'border-deny/40 bg-deny-soft') : r.status === 'pending_approval' ? 'border-ask/40 bg-ask-soft' : 'border-allow/30 bg-allow-soft',
          )}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium tracking-wide text-ink-2 uppercase">Allowance</span>
            {r.status && <StatusChip status={r.status} decidedBy={r.decidedBy} />}
            <span className="tabular ml-auto font-medium">{r.amount}</span>
          </div>
          <p className="mt-1">{r.message}</p>
          {!!r.reasons?.length && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-2">
              {r.reasons.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case 'message':
      return (
        <div className="rounded-xl border border-line bg-surface p-4 text-sm whitespace-pre-wrap">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium tracking-wide text-ink-2 uppercase">
            <Bot className="h-4 w-4" aria-hidden="true" /> Agent&apos;s report
          </div>
          {step.text}
        </div>
      );
    case 'error':
      return <p className="text-sm text-deny">Error: {step.text}</p>;
    default:
      return null;
  }
}

export default function PlaygroundPage() {
  const { state, refresh } = useDashboard();
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const [task, setTask] = useState(preset.task);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);

  const agent = state?.agents.find((a) => a.id === preset.agentId);
  const pending = useMemo(
    () => (state?.requests ?? []).filter((r) => r.status === 'pending_approval' && r.agentId === preset.agentId && (!startedAt || new Date(r.createdAt).getTime() >= startedAt - 1000)),
    [state, preset.agentId, startedAt],
  );

  function choose(id: string) {
    const p = PRESETS.find((x) => x.id === id)!;
    setPresetId(id);
    setTask(p.task);
  }

  async function run() {
    setSteps([]);
    setRunning(true);
    setStartedAt(Date.now());
    abort.current = new AbortController();
    try {
      const res = await fetch('/api/demo/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: preset.agentId, task, mode: preset.mode }),
        signal: abort.current.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const line = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (line) setSteps((s) => [...s, JSON.parse(line.slice(6))]);
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setSteps((s) => [...s, { kind: 'error', text: (err as Error).message, at: Date.now() }]);
    } finally {
      setRunning(false);
      refresh();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agent playground</h1>
        <p className="mt-1 text-sm text-ink-2">
          A real OpenAI agent shops the demo stores and pays through Allowance&apos;s MCP tools, the same ones Claude, ChatGPT or Cursor would use.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)_minmax(0,380px)]">
        <Card className="h-fit space-y-4 p-4">
          <div>
            <SectionTitle>Scenario</SectionTitle>
            <div className="space-y-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => choose(p.id)}
                  disabled={running}
                  className={clsx('w-full rounded-xl border p-3 text-left text-sm transition-colors', p.id === presetId ? 'border-ink bg-surface-2' : 'border-line hover:bg-surface-2')}
                >
                  <div className="flex items-center gap-2 font-medium">
                    {p.label}
                    {p.mode === 'compromised' && <Chip tone="deny">attack</Chip>}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-2">{p.note}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="task" className="text-xs font-medium text-ink-2">
              Task for {agent?.name ?? 'the agent'}
            </label>
            <textarea
              id="task"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={5}
              disabled={running}
              className="mt-1 w-full rounded-lg border border-line bg-surface p-2.5 text-sm outline-none focus:border-brand"
            />
          </div>
          {running ? (
            <Button variant="secondary" className="w-full" onClick={() => abort.current?.abort()}>
              <Square className="h-4 w-4" aria-hidden="true" /> Stop
            </Button>
          ) : (
            <Button className="w-full" size="lg" onClick={run} disabled={!state || !agent}>
              <Play className="h-4 w-4" aria-hidden="true" /> Run {agent?.name}
            </Button>
          )}
          {state && !state.wallet && <p className="text-xs text-ask">Link a PayPal wallet on the dashboard first, or every payment will be refused.</p>}
          <a href="/mall/freshcart/deals" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-ink-2 underline">
            See the deals page as a human sees it <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
          <button
            type="button"
            disabled={running}
            onClick={async () => {
              if (!confirm('Clear purchase history and activity so budgets start fresh? The wallet and agents stay.')) return;
              await api('/api/demo/reset', { method: 'POST' });
              setSteps([]);
              refresh();
            }}
            className="flex items-center gap-1 text-xs text-ink-3 hover:text-ink disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" /> Reset demo data
          </button>
        </Card>

        <Card className="min-h-[480px] p-4">
          <SectionTitle action={running && <Spinner className="text-ink-3" />}>Agent run</SectionTitle>
          {steps.length === 0 && !running && <p className="text-sm text-ink-3">Pick a scenario and press Run.</p>}
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="slide-in">
                <StepView step={s} />
              </li>
            ))}
          </ol>
        </Card>

        <div className="space-y-4">
          <SectionTitle>Your phone</SectionTitle>
          {pending.length === 0 ? (
            <Card className="p-5 text-sm text-ink-3">Approval requests from this run appear here (and on your phone, if ntfy is set up).</Card>
          ) : (
            pending.map((r) => <ApprovalCard key={r.id} request={r} agentName={agent?.name ?? 'Agent'} onDone={refresh} />)
          )}
        </div>
      </div>
    </div>
  );
}
