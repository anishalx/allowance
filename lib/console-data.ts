import { desc, eq } from 'drizzle-orm';
import { currentUserId } from './dashboard';
import { db, dbReady } from './db';
import { agents, operations, paymentRequests } from './db/schema';
import { searchTransactions } from './paypal/api';
import { toCents } from './policy/engine';

// Flattens Allowance's ledger (and PayPal's own records) into the tables AG Studio analyses.

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function getConsoleData() {
  await dbReady();
  const userId = await currentUserId();
  const agentRows = await db.select().from(agents).where(eq(agents.userId, userId));
  const requests = await db.select().from(paymentRequests).where(eq(paymentRequests.userId, userId)).orderBy(desc(paymentRequests.createdAt));
  const agentName = new Map(agentRows.map((a) => [a.id, a.name]));

  const purchases = requests.map((r) => ({
    id: r.id,
    created_date: day(r.createdAt),
    created_at: r.createdAt.toISOString(),
    agent_id: r.agentId,
    agent: agentName.get(r.agentId) ?? r.agentId,
    merchant: r.merchant.name,
    merchant_verified: r.merchant.verified ? 'Verified' : 'Unverified',
    merchant_category: r.merchant.category,
    amount: r.amountCents / 100,
    spent: ['paid', 'settled', 'processing'].includes(r.status) ? r.amountCents / 100 : 0,
    blocked_amount: r.status === 'denied' ? r.amountCents / 100 : 0,
    status: r.status,
    outcome: r.status === 'denied' || r.status === 'expired' ? 'Blocked' : r.status === 'pending_approval' ? 'Waiting' : r.status === 'failed' ? 'Failed' : r.status === 'refunded' ? 'Refunded' : 'Paid',
    decision: r.decision,
    decided_by: { policy: 'Rules engine', auditor: 'AI auditor', human: 'Human', timeout: 'Timed out' }[r.decidedBy],
    engine_decision: r.policyDecision,
    ai_verdict: r.audit?.verdict ?? 'n/a',
    ai_risk: r.audit?.riskScore ?? 0,
    payout_status: r.payoutStatus ?? 'n/a',
    payout_fee: (r.payoutFeeCents ?? 0) / 100,
    paypal_order_id: r.paypalOrderId ?? '',
    capture_id: r.captureId ?? '',
    purpose: r.purpose,
    items: r.items.length,
  }));

  const lineItems = requests.flatMap((r) =>
    r.items.map((i, n) => ({
      id: `${r.id}-${n}`,
      purchase_id: r.id,
      item: i.name,
      category: i.category,
      quantity: i.quantity,
      unit_price: i.unitPrice,
      line_total: (toCents(i.unitPrice) * i.quantity) / 100,
    })),
  );

  const ruleChecks = requests.flatMap((r) =>
    r.policyChecks.map((c, n) => ({ id: `${r.id}-c${n}`, purchase_id: r.id, rule: c.rule, outcome: c.outcome, detail: c.detail })),
  );

  const opRows = await db.select().from(operations).where(eq(operations.userId, userId)).orderBy(desc(operations.createdAt));
  const businessActions = opRows.map((o) => ({
    id: o.id,
    created_date: day(o.createdAt),
    agent_id: o.agentId,
    agent: agentName.get(o.agentId) ?? o.agentId,
    action: { refund: 'Refund', invoice: 'Invoice', accept_dispute: 'Accept dispute' }[o.kind],
    paypal_tool: o.paypalTool,
    target: o.target,
    amount: o.amountCents / 100,
    outcome: o.status === 'done' ? 'Done' : o.status === 'pending_approval' ? 'Waiting' : o.status === 'failed' ? 'Failed' : 'Blocked',
    decided_by: { policy: 'Rules engine', auditor: 'AI auditor', human: 'Human', timeout: 'Timed out' }[o.decidedBy],
    ai_verdict: o.audit?.verdict ?? 'n/a',
    ai_risk: o.audit?.riskScore ?? 0,
    reason: o.reason,
  }));

  const agentTable = agentRows.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    kind: a.kind === 'business' ? 'Operates PayPal' : 'Spends wallet',
    status: a.status,
    weekly_limit: a.policy.limits.weekly ?? 0,
    monthly_limit: a.policy.limits.monthly ?? 0,
    auto_approve_up_to: a.policy.approval.requireAbove ?? 0,
    rules_version: a.policyVersion,
  }));

  // PayPal's own view of the money (Transaction Search). Reporting can lag in the sandbox, and the
  // feature must be enabled on the app; an empty table is fine.
  let paypalTransactions: Record<string, string | number>[] = [];
  let paypalNote: string | null = null;
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 86_400_000);
    paypalTransactions = (await searchTransactions(start, end)).map((t) => {
      const info = t.transaction_info ?? {};
      return {
        id: info.transaction_id,
        date: String(info.transaction_initiation_date ?? '').slice(0, 10),
        event_code: info.transaction_event_code ?? '',
        status: info.transaction_status ?? '',
        amount: Number(info.transaction_amount?.value ?? 0),
        fee: Number(info.fee_amount?.value ?? 0),
        purchase_id: info.invoice_id ?? info.custom_field ?? '',
      };
    });
  } catch (err) {
    paypalNote = `PayPal Transaction Search unavailable: ${(err as Error).message}`;
  }

  return { purchases, lineItems, ruleChecks, businessActions, agents: agentTable, paypalTransactions, paypalNote };
}

export type ConsoleData = Awaited<ReturnType<typeof getConsoleData>>;

// Compare Allowance's ledger with PayPal's records for captures Allowance made.
export async function reconcile() {
  const data = await getConsoleData();
  const charged = data.purchases.filter((p) => p.capture_id);
  const byPurchase = new Map(data.paypalTransactions.filter((t) => t.purchase_id).map((t) => [t.purchase_id as string, t]));
  const rows = charged.map((p) => {
    const t = byPurchase.get(p.id);
    if (!t) return { purchase_id: p.id, merchant: p.merchant, allowance_amount: p.amount, paypal_amount: null, result: 'not yet in PayPal reporting' };
    const ok = Math.abs(Math.abs(Number(t.amount)) - p.amount) < 0.005;
    return { purchase_id: p.id, merchant: p.merchant, allowance_amount: p.amount, paypal_amount: Number(t.amount), result: ok ? 'matched' : 'AMOUNT MISMATCH' };
  });
  return {
    checked: rows.length,
    matched: rows.filter((r) => r.result === 'matched').length,
    pending: rows.filter((r) => r.result === 'not yet in PayPal reporting').length,
    mismatched: rows.filter((r) => r.result === 'AMOUNT MISMATCH').length,
    note: data.paypalNote ?? 'Sandbox Transaction Search can lag behind live captures by a few minutes or more.',
    rows,
  };
}
