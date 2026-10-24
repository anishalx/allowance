'use client';

import {
  AgStudioAiModule,
  createAiHarness,
  directLlmRunner,
  enableStudioDevValidations,
  studioTheme,
  type AgAiHarnessSetup,
  type AgAiPromptStarter,
  type AgAiTool,
  type AgDataSourcesDefinition,
  type AgFieldDefinition,
  type AgReportState,
  type AgStudioApi,
} from 'ag-studio';
import { AgStudio, AgStudioProvider } from 'ag-studio-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConsoleData } from '@/lib/console-data';
import type { DashboardState } from '@/lib/dashboard';
import type { CompiledMandate } from '@/lib/ai/compiler';
import { usd } from '@/lib/format';
import { Spinner } from '../ui';
import { api } from '../use-dashboard';
import { useConfirm, type ConfirmRequest } from './confirm';
import { openaiAdapter } from './openai-adapter';

if (process.env.NODE_ENV !== 'production') enableStudioDevValidations();

const adapter = openaiAdapter({ endpoint: '/api/llm' });

const text = (id: string, name: string, description?: string): AgFieldDefinition => ({ id, name, format: 'textFormat', description });
const money = (id: string, name: string, description?: string): AgFieldDefinition => ({ id, name, format: 'currencyFormat', formatOptions: { format: '$#,##0.00' }, description });
const int = (id: string, name: string, description?: string): AgFieldDefinition => ({ id, name, format: 'integerFormat', description });

function toStudioData(d: ConsoleData): AgDataSourcesDefinition {
  return {
    description:
      'Allowance ledger: every payment an AI agent asked to make from the human\'s PayPal wallet, how Allowance decided (rules engine, AI auditor, or the human), and what PayPal did with the money.',
    sources: [
      {
        id: 'purchases',
        name: 'Purchases',
        description: 'One row per payment request from an AI agent.',
        data: d.purchases,
        fields: [
          text('id', 'Purchase ID'),
          { id: 'created_date', name: 'Date', format: 'dateFormat' },
          text('agent_id', 'Agent ID'),
          text('agent', 'Agent'),
          text('merchant', 'Merchant'),
          text('merchant_verified', 'Payee', 'Whether the payee came from the verified merchant directory.'),
          text('merchant_category', 'Merchant category'),
          money('amount', 'Amount requested'),
          money('spent', 'Spent', 'Amount actually charged to the PayPal wallet.'),
          money('blocked_amount', 'Blocked amount', 'Amount Allowance refused to pay.'),
          text('outcome', 'Outcome', 'Paid, Blocked, Waiting, Failed or Refunded.'),
          text('status', 'Status'),
          text('decided_by', 'Decided by', 'Rules engine, AI auditor, Human, or Timed out.'),
          text('engine_decision', 'Rules engine verdict'),
          text('ai_verdict', 'AI verdict', 'consistent, suspicious or malicious.'),
          int('ai_risk', 'AI risk score', '0 to 100 from the AI auditor.'),
          text('payout_status', 'Merchant payout status'),
          money('payout_fee', 'Payout fee'),
          text('paypal_order_id', 'PayPal order ID'),
          text('capture_id', 'PayPal capture ID'),
          text('purpose', 'Agent\'s stated purpose'),
          int('items', 'Line items'),
        ],
      },
      {
        id: 'line_items',
        name: 'Line items',
        data: d.lineItems,
        fields: [
          text('id', 'Line ID'),
          text('purchase_id', 'Purchase ID'),
          text('item', 'Item'),
          text('category', 'Category'),
          int('quantity', 'Quantity'),
          money('unit_price', 'Unit price'),
          money('line_total', 'Line total'),
        ],
      },
      {
        id: 'rule_checks',
        name: 'Rule checks',
        description: 'Every rule the deterministic engine evaluated per purchase.',
        data: d.ruleChecks,
        fields: [text('id', 'Check ID'), text('purchase_id', 'Purchase ID'), text('rule', 'Rule'), text('outcome', 'Rule outcome'), text('detail', 'Detail')],
      },
      {
        id: 'business_actions',
        name: 'Business actions',
        description: "Refunds, invoices and dispute decisions that business agents asked to run on the store's PayPal account through PayPal's Agent Toolkit, and how Allowance decided.",
        data: d.businessActions,
        fields: [
          text('id', 'Action ID'),
          { id: 'created_date', name: 'Date', format: 'dateFormat' },
          text('agent_id', 'Agent ID'),
          text('agent', 'Agent'),
          text('action', 'Action'),
          text('paypal_tool', 'PayPal Agent Toolkit tool'),
          text('target', 'Target'),
          money('amount', 'Amount'),
          text('outcome', 'Outcome'),
          text('decided_by', 'Decided by'),
          text('ai_verdict', 'AI verdict'),
          int('ai_risk', 'AI risk score'),
          text('reason', "Agent's stated reason"),
        ],
      },
      {
        id: 'agents',
        name: 'Agents',
        data: d.agents,
        fields: [
          text('id', 'Agent ID'),
          text('name', 'Agent name'),
          text('role', 'Role'),
          text('kind', 'Kind'),
          text('status', 'Agent status'),
          money('weekly_limit', 'Weekly limit'),
          money('monthly_limit', 'Monthly limit'),
          money('auto_approve_up_to', 'Auto-approve up to'),
          int('rules_version', 'Rules version'),
        ],
      },
      {
        id: 'paypal_transactions',
        name: 'PayPal transactions',
        description: 'PayPal Transaction Search records for the merchant account (last 30 days). Sandbox reporting can lag.',
        data: d.paypalTransactions,
        fields: [
          text('id', 'PayPal transaction ID'),
          { id: 'date', name: 'PayPal date', format: 'dateFormat' },
          text('event_code', 'Event code'),
          text('status', 'PayPal status'),
          money('amount', 'PayPal amount'),
          money('fee', 'PayPal fee'),
          text('purchase_id', 'Purchase ID (invoice)'),
        ],
      },
    ],
    relationships: [
      { id: 'purchase-agent', source: { tableId: 'purchases', fieldId: 'agent_id' }, target: { tableId: 'agents', fieldId: 'id' }, type: 'many-to-one' },
      { id: 'action-agent', source: { tableId: 'business_actions', fieldId: 'agent_id' }, target: { tableId: 'agents', fieldId: 'id' }, type: 'many-to-one' },
      { id: 'item-purchase', source: { tableId: 'line_items', fieldId: 'purchase_id' }, target: { tableId: 'purchases', fieldId: 'id' }, type: 'many-to-one' },
      { id: 'check-purchase', source: { tableId: 'rule_checks', fieldId: 'purchase_id' }, target: { tableId: 'purchases', fieldId: 'id' }, type: 'many-to-one' },
      { id: 'paypal-purchase', source: { tableId: 'paypal_transactions', fieldId: 'purchase_id' }, target: { tableId: 'purchases', fieldId: 'id' }, type: 'many-to-one' },
    ],
  };
}

const caption = (t: string) => ({ caption: { enabled: true, text: t } });

const INITIAL_STATE: AgReportState = {
  pages: [
    {
      id: 'overview',
      widgets: {
        spent: { type: 'value', dataMapping: { value: [{ id: 'purchases.spent', aggregation: 'sum' }] }, format: caption('Spent by agents') },
        blocked: { type: 'value', dataMapping: { value: [{ id: 'purchases.blocked_amount', aggregation: 'sum' }] }, format: caption('Blocked') },
        requests: { type: 'value', dataMapping: { value: [{ id: 'purchases.id', aggregation: 'count' }] }, format: caption('Payment requests') },
        risk: { type: 'value', dataMapping: { value: [{ id: 'purchases.ai_risk', aggregation: 'max' }] }, format: caption('Highest AI risk') },
        outcomes: {
          type: 'donut-chart',
          dataMapping: { categoryKey: [{ id: 'purchases.outcome' }], valueKey: [{ id: 'purchases.id', aggregation: 'count' }] },
          format: caption('Outcomes'),
        },
        byAgent: {
          type: 'bar-chart-grouped',
          dataMapping: { categoryKey: [{ id: 'purchases.agent' }], valueKey: [{ id: 'purchases.spent', aggregation: 'sum' }, { id: 'purchases.blocked_amount', aggregation: 'sum' }] },
          format: caption('Spent vs blocked by agent'),
        },
        decidedBy: {
          type: 'bar-chart-grouped',
          dataMapping: { categoryKey: [{ id: 'purchases.decided_by' }], valueKey: [{ id: 'purchases.id', aggregation: 'count' }] },
          format: caption('Who decided'),
        },
        ledger: {
          type: 'grid',
          dataMapping: {
            cols: [
              { id: 'purchases.created_date' },
              { id: 'purchases.agent' },
              { id: 'purchases.merchant' },
              { id: 'purchases.merchant_verified' },
              { id: 'purchases.amount' },
              { id: 'purchases.outcome' },
              { id: 'purchases.decided_by' },
              { id: 'purchases.ai_risk' },
              { id: 'purchases.payout_status' },
              { id: 'purchases.id' },
            ],
          },
          format: caption('Ledger'),
        },
      },
      widgetLayout: {
        spent: { xTrack: 0, yTrack: 0, xSpan: 6, ySpan: 5 },
        blocked: { xTrack: 6, yTrack: 0, xSpan: 6, ySpan: 5 },
        requests: { xTrack: 12, yTrack: 0, xSpan: 6, ySpan: 5 },
        risk: { xTrack: 18, yTrack: 0, xSpan: 6, ySpan: 5 },
        outcomes: { xTrack: 0, yTrack: 5, xSpan: 8, ySpan: 14 },
        byAgent: { xTrack: 8, yTrack: 5, xSpan: 8, ySpan: 14 },
        decidedBy: { xTrack: 16, yTrack: 5, xSpan: 8, ySpan: 14 },
        ledger: { xTrack: 0, yTrack: 19, xSpan: 24, ySpan: 20 },
      },
    },
    { id: 'explore' },
  ],
  selectedPageId: 'overview',
  // Open on the report and the assistant; editing panels are one click away.
  panels: { filters: { collapsed: true }, edit: { collapsed: true }, data: { collapsed: true } },
};

const PROMPT_STARTERS: AgAiPromptStarter[] = [
  { label: 'Why was anything blocked?', prompt: 'Which purchases were blocked, who blocked them (rules, AI auditor or human), and why? Be specific.' },
  { label: 'Chart spend by merchant', prompt: 'On the Explore page, add a bar chart of total spent by merchant, split by agent.' },
  { label: 'Reconcile with PayPal', prompt: 'Reconcile Allowance\'s ledger with PayPal\'s transaction records and summarise the result.' },
  { label: 'Freeze risky agents', prompt: 'If any agent made a purchase request with an AI risk score above 80, freeze that agent.' },
  { label: 'Tighten Pantry', prompt: 'Lower Pantry\'s weekly limit to $40.' },
];

const GUARDIAN = `
You are also Allowance's Guardian: the human's control room for AI agents that spend their PayPal money.
Tables: purchases (one row per agent payment request, with how it was decided), line_items, rule_checks,
business_actions (refunds/invoices business agents tried to run on the store's PayPal via PayPal's Agent Toolkit), agents,
and paypal_transactions (PayPal Transaction Search; can lag behind in the sandbox). Amounts are USD.
Use the dashboard tools to answer questions and build charts. You can also act through Allowance tools:
freeze_agent, unfreeze_agent, refund_purchase, change_agent_rules, explain_purchase, reconcile_with_paypal.
Every action asks the human to confirm in the app; if a tool reports it was cancelled, say so and stop.
Never claim an action happened unless its tool returned success.`;

type Ctx = { confirm: (r: ConfirmRequest) => Promise<boolean>; reload: () => Promise<void> };

function allowanceTools(studioApi: AgStudioApi, ctx: Ctx): AgAiTool[] {
  const state = () => api<DashboardState>('/api/state');
  const findAgent = async (name: string) => {
    const s = await state();
    return s.agents.find((a) => a.name.toLowerCase() === name.trim().toLowerCase() || a.id === name.trim());
  };

  return [
    studioApi.defineAiTool({
      name: 'freeze_agent',
      description: 'Freeze an agent so it cannot spend anything until unfrozen. Asks the human to confirm.',
      params: (s) => s.object({ agent: s.string({ description: 'Agent name, e.g. "Pantry"' }), reason: s.string({ description: 'Why, in one sentence' }) }),
      execute: async (args, c) => {
        const agent = await findAgent(args.agent);
        if (!agent) return c.error(`No agent named ${args.agent}.`);
        if (agent.status === 'frozen') return c.success(`${agent.name} is already frozen.`);
        if (!(await ctx.confirm({ title: `Freeze ${agent.name}?`, body: `${args.reason}\n\n${agent.name} won't be able to spend until you unfreeze it.`, confirmLabel: 'Freeze', danger: true })))
          return c.error('The human cancelled this action.');
        await api(`/api/agents/${agent.id}`, { method: 'PATCH', json: { status: 'frozen' } });
        await ctx.reload();
        return c.success(`${agent.name} is frozen.`);
      },
    }),
    studioApi.defineAiTool({
      name: 'unfreeze_agent',
      description: 'Let a frozen agent spend again. Asks the human to confirm.',
      params: (s) => s.object({ agent: s.string({ description: 'Agent name' }) }),
      execute: async (args, c) => {
        const agent = await findAgent(args.agent);
        if (!agent) return c.error(`No agent named ${args.agent}.`);
        if (!(await ctx.confirm({ title: `Unfreeze ${agent.name}?`, body: `${agent.name} will be able to spend within its rules again.`, confirmLabel: 'Unfreeze' })))
          return c.error('The human cancelled this action.');
        await api(`/api/agents/${agent.id}`, { method: 'PATCH', json: { status: 'active' } });
        await ctx.reload();
        return c.success(`${agent.name} is active again.`);
      },
    }),
    studioApi.defineAiTool({
      name: 'refund_purchase',
      description: 'Refund a paid purchase back to the human\'s PayPal wallet (PayPal Payments API). Asks the human to confirm.',
      params: (s) => s.object({ purchase_id: s.string({ description: 'Purchase ID, e.g. req_abc123' }), reason: s.string() }),
      execute: async (args, c) => {
        const r = (await state()).requests.find((x) => x.id === args.purchase_id.trim());
        if (!r) return c.error(`No purchase ${args.purchase_id}.`);
        if (!['paid', 'settled'].includes(r.status)) return c.error(`That purchase is ${r.status}; only paid purchases can be refunded.`);
        const items = r.items.map((i) => `${i.quantity}× ${i.name}`).join(', ');
        if (!(await ctx.confirm({ title: `Refund ${usd(r.amountCents)}?`, body: `${r.merchant.name}: ${items}\nReason: ${args.reason}\n\nPayPal returns the money to your wallet.`, confirmLabel: 'Refund' })))
          return c.error('The human cancelled this action.');
        const result = await api<{ status: string }>(`/api/requests/${r.id}/refund`, { method: 'POST', json: { reason: args.reason } });
        await ctx.reload();
        return c.success(`Refunded ${usd(r.amountCents)} (status ${result.status}).`);
      },
    }),
    studioApi.defineAiTool({
      name: 'change_agent_rules',
      description: 'Change an agent\'s spending rules from a plain-English instruction. Compiles new rules and asks the human to confirm.',
      params: (s) =>
        s.object({ agent: s.string({ description: 'Agent name' }), change: s.string({ description: 'The change in plain English, e.g. "lower the weekly limit to $40"' }) }),
      execute: async (args, c) => {
        const agent = await findAgent(args.agent);
        if (!agent) return c.error(`No agent named ${args.agent}.`);
        const text = `${agent.mandateText}\nUpdate: ${args.change}`;
        const compiled = await api<CompiledMandate>('/api/mandates/compile', { method: 'POST', json: { agentName: agent.name, agentRole: agent.role, text, kind: agent.kind } });
        const before = agent.policy.summary;
        if (!(await ctx.confirm({ title: `Update ${agent.name}'s rules?`, body: `Before: ${before}\n\nAfter: ${compiled.policy.summary}`, confirmLabel: 'Save rules' })))
          return c.error('The human cancelled this action.');
        await api(`/api/agents/${agent.id}`, { method: 'PATCH', json: { mandateText: text, ...(agent.kind === 'business' ? { opsPolicy: compiled.policy } : { policy: compiled.policy }) } });
        await ctx.reload();
        return c.success(`Saved. ${compiled.policy.summary}`, { policy: compiled.policy });
      },
    }),
    studioApi.defineAiTool({
      name: 'explain_purchase',
      description: 'Full decision trace for one purchase: every rule check, the AI auditor verdict and signals, and the PayPal IDs.',
      params: (s) => s.object({ purchase_id: s.string() }),
      execute: async (args, c) => {
        const r = (await state()).requests.find((x) => x.id === args.purchase_id.trim());
        if (!r) return c.error(`No purchase ${args.purchase_id}.`);
        return c.success('Decision trace loaded.', {
          status: r.status,
          decidedBy: r.decidedBy,
          ruleChecks: r.policyChecks,
          auditor: r.audit,
          paypal: { orderId: r.paypalOrderId, captureId: r.captureId, payoutBatchId: r.payoutBatchId, payoutStatus: r.payoutStatus },
        });
      },
    }),
    studioApi.defineAiTool({
      name: 'reconcile_with_paypal',
      description: 'Compare Allowance\'s ledger with PayPal Transaction Search records for every capture Allowance made.',
      params: (s) => s.object({}),
      execute: async (_args, c) => c.success('Reconciliation complete.', await api('/api/console/reconcile')),
    }),
  ];
}

export default function StudioConsole() {
  const [data, setData] = useState<AgDataSourcesDefinition | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const ctxRef = useRef<Ctx>({ confirm, reload: async () => {} });

  const reload = useCallback(
    () =>
      api<ConsoleData>('/api/console/data').then((d) => {
        setData(toStudioData(d));
        setNote(d.paypalNote);
      }),
    [],
  );
  // The Guardian's tools are registered once, so they read the latest confirm/reload through this ref.
  useEffect(() => {
    ctxRef.current = { confirm, reload };
  }, [confirm, reload]);

  useEffect(() => {
    reload();
  }, [reload]);

  const theme = useMemo(
    () =>
      studioTheme.withParams({
        backgroundColor: 'var(--surface)',
        foregroundColor: 'var(--ink)',
        accentColor: 'var(--brand)',
        borderColor: 'var(--line)',
        fontFamily: 'var(--font-geist-sans)',
        // Series colours follow Allowance's language: paid/spent green, blocked red, then amber and violet.
        chartPaletteFills1Color: 'var(--allow)',
        chartPaletteStrokes1Color: 'var(--allow)',
        chartPaletteFills2Color: 'var(--deny)',
        chartPaletteStrokes2Color: 'var(--deny)',
        chartPaletteFills3Color: 'var(--ask)',
        chartPaletteStrokes3Color: 'var(--ask)',
        chartPaletteFills4Color: 'var(--ai)',
        chartPaletteStrokes4Color: 'var(--ai)',
      }),
    [],
  );

  const ai = useMemo<AgAiHarnessSetup>(
    () =>
      ({ api: studioApi }) =>
        createAiHarness(studioApi, ({ builtIn }) => {
          const lead = builtIn.lead;
          return {
            agents: [
              directLlmRunner({
                ...lead,
                adapter,
                instructions: (c, p) => `${lead.instructions?.(c, p) ?? ''}\n${GUARDIAN}`,
                tools: (c, p) => [...(lead.tools?.(c, p) ?? []), ...allowanceTools(studioApi, ctxRef.current)],
              }),
              ...(['data', 'page', 'planning', 'widget'] as const).map((id) => directLlmRunner({ ...builtIn[id], adapter })),
            ],
            primary: 'lead',
            promptStarters: PROMPT_STARTERS,
            models: [
              { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini (fast)' },
              { id: 'gpt-5.5', label: 'GPT-5.5 (thorough)' },
            ],
          };
        }),
    [],
  );

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-ink-2">
        <Spinner /> Loading ledger…
      </div>
    );
  }

  return (
    <AgStudioProvider modules={[AgStudioAiModule]}>
      {note && <p className="mb-2 text-xs text-ink-3">{note}</p>}
      <div className="h-full overflow-hidden rounded-2xl border border-line">
        <AgStudio style={{ height: '100%', width: '100%' }} data={data} initialState={INITIAL_STATE} mode="edit" theme={theme} ai={ai} />
      </div>
      {dialog}
    </AgStudioProvider>
  );
}
