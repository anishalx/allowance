import { randomBytes } from 'node:crypto';
import { and, desc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { applyAudit, auditOperation } from '../ai/auditor';
import { newId } from '../agents/keys';
import { db, dbReady } from '../db';
import { agents, operations, users, wallets, type Agent, type Operation, type OperationStatus } from '../db/schema';
import { bus, record } from '../events';
import { pushApprovalRequest } from '../notify';
import { paypal, PayPalError } from '../paypal/client';
import { formatUsd, toCents } from '../policy/engine';
import { evaluateOp } from './engine';
import { callPayPalTool } from './paypal-tools';
import type { CaptureFacts, OpInput } from './schema';

const APPROVAL_TTL_MS = 15 * 60 * 1000;
const DAY_MS = 86_400_000;

// What business agents may ask for. Each maps onto one PayPal Agent Toolkit tool.
export const RefundInput = z.object({
  capture_id: z.string().min(5).describe('The PayPal capture ID to refund (from get_order: purchase_units[].payments.captures[].id).'),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().describe('Amount in USD, e.g. "6.00". Omit to refund the full remaining amount.'),
  note_to_payer: z.string().max(255).optional(),
  requested_by: z.string().min(3).max(254).describe('The email address of the person who asked for this refund, exactly as it appears on their message.'),
  reason: z.string().min(3).max(1500).describe("Why you're refunding, including what the customer asked for, in your own words."),
});
export const InvoiceInput = z.object({
  recipient_email: z.email(),
  items: z
    .array(z.object({ name: z.string().min(1), quantity: z.number().int().positive(), unit_price: z.number().positive() }))
    .min(1)
    .max(20),
  note: z.string().max(500).optional(),
  reason: z.string().min(3).max(1500).describe('Who asked for this invoice and why.'),
});
export const AcceptDisputeInput = z.object({
  dispute_id: z.string().min(5),
  note: z.string().min(3).max(500).describe('Note to PayPal about why the claim is accepted.'),
  reason: z.string().min(3).max(1500),
});

export type OperationRequest =
  | ({ kind: 'refund' } & z.infer<typeof RefundInput>)
  | ({ kind: 'invoice' } & z.infer<typeof InvoiceInput>)
  | ({ kind: 'accept_dispute' } & z.infer<typeof AcceptDisputeInput>);

// ── Facts from PayPal ──────────────────────────────────────────────────────────────────────

async function captureFacts(captureId: string): Promise<CaptureFacts | null> {
  try {
    const cap = await paypal<any>('GET', `/v2/payments/captures/${encodeURIComponent(captureId)}`);
    // The parent order tells us who paid and what has already been refunded.
    const orderHref: string | undefined = cap.links?.find((l: { rel: string }) => l.rel === 'up')?.href;
    const order = orderHref ? await paypal<any>('GET', new URL(orderHref).pathname) : null;
    let refundedCents = (order?.purchase_units ?? [])
      .flatMap((u: any) => u.payments?.refunds ?? [])
      .filter((r: any) => r.status === 'COMPLETED' || r.status === 'PENDING')
      .reduce((sum: number, r: any) => sum + toCents(Number(r.amount.value)), 0);
    if (cap.status === 'REFUNDED') refundedCents = toCents(Number(cap.amount.value));
    const payerEmail: string | null = order?.payer?.email_address ?? order?.payment_source?.paypal?.email_address ?? null;
    return { id: cap.id, status: cap.status, amountCents: toCents(Number(cap.amount.value)), refundedCents, createdAt: new Date(cap.create_time), payerEmail };
  } catch (err) {
    if (err instanceof PayPalError && (err.status === 404 || err.status === 400 || err.status === 403)) return null;
    throw err;
  }
}

async function disputeFacts(disputeId: string) {
  try {
    const d = await paypal<any>('GET', `/v1/customer/disputes/${encodeURIComponent(disputeId)}`);
    return { status: d.status as string, amountCents: d.dispute_amount ? toCents(Number(d.dispute_amount.value)) : 0 };
  } catch (err) {
    if (err instanceof PayPalError && err.status === 404) return null;
    throw err;
  }
}

async function isKnownCustomer(userId: string, email: string) {
  const rows = await db.select({ payerEmail: wallets.payerEmail }).from(wallets).where(eq(wallets.userId, userId));
  return rows.some((w) => w.payerEmail?.toLowerCase() === email.toLowerCase());
}

async function recentOps(agentId: string) {
  return db.select().from(operations).where(eq(operations.agentId, agentId)).orderBy(desc(operations.createdAt)).limit(20);
}

// ── Results for agents ─────────────────────────────────────────────────────────────────────

export function toAgentOpResult(op: Operation) {
  const reasons = [
    ...op.checks.filter((c) => c.outcome !== 'pass').map((c) => c.detail),
    ...(op.audit && op.audit.verdict !== 'consistent' ? [`Auditor: ${op.audit.explanation}`] : []),
  ];
  const messages: Record<OperationStatus, string> = {
    pending_approval: 'Waiting for your human to approve. Call get_action_status with this action_id; do not resubmit.',
    denied: 'Denied. Do not retry or work around this; tell your human what you tried and why it was blocked.',
    expired: 'Your human did not respond in time. Ask them directly before trying again.',
    executing: 'Approved. Running it through PayPal now.',
    done: 'Done in PayPal.',
    failed: `PayPal returned an error${op.error ? `: ${op.error}` : ''}. Tell your human; do not retry automatically.`,
  };
  return {
    actionId: op.id,
    kind: op.kind,
    status: op.status,
    decision: op.decision,
    decidedBy: op.decidedBy,
    message: messages[op.status],
    reasons,
    amount: formatUsd(op.amountCents),
    target: op.target,
    ...(op.result && { paypal: op.result }),
  };
}

export async function getOperation(id: string) {
  await dbReady();
  const [op] = await db.select().from(operations).where(eq(operations.id, id)).limit(1);
  if (op?.status === 'pending_approval' && op.approvalExpiresAt && op.approvalExpiresAt < new Date()) {
    return transition(op, { status: 'expired', decision: 'deny', decidedBy: 'timeout', approvalToken: null }, 'op.expired', 'Approval window expired.');
  }
  return op ?? null;
}

async function transition(op: Operation, patch: Partial<Operation>, type: string, message: string, data?: Record<string, unknown>) {
  const [updated] = await db.update(operations).set(patch).where(eq(operations.id, op.id)).returning();
  await record({ userId: op.userId, agentId: op.agentId, requestId: op.id, type, message, data: { status: updated.status, ...data } });
  return updated;
}

// ── The entry point: a business agent asks to act on the PayPal account ────────────────────

const describeKind = { refund: 'refund', invoice: 'invoice', accept_dispute: 'dispute acceptance' } as const;

export async function requestOperation(agent: Agent, request: OperationRequest) {
  await dbReady();
  const [fresh] = await db.select().from(agents).where(eq(agents.id, agent.id));
  if (fresh.kind !== 'business' || !fresh.opsPolicy) throw new Error('This agent has no permissions on the PayPal account.');
  const policy = fresh.opsPolicy;
  const now = new Date();
  const recent = await recentOps(fresh.id);
  const doneSince = (kind: string) => recent.filter((o) => o.kind === kind && o.status === 'done' && o.createdAt.getTime() > now.getTime() - DAY_MS);

  let op: OpInput;
  let paypalTool: string;
  let args: Record<string, unknown>;
  let target: string;
  let details: Record<string, unknown> = {};

  if (request.kind === 'refund') {
    const capture = await captureFacts(request.capture_id);
    const remaining = capture ? capture.amountCents - capture.refundedCents : 0;
    const amountCents = request.amount ? toCents(Number(request.amount)) : remaining;
    op = { kind: 'refund', amountCents, capture, refundedLast24hCents: doneSince('refund').reduce((s, o) => s + o.amountCents, 0), requestedBy: request.requested_by };
    paypalTool = 'create_refund';
    args = {
      capture_id: request.capture_id,
      ...(request.amount && { amount: { currency_code: 'USD', value: Number(request.amount).toFixed(2) } }),
      ...(request.note_to_payer && { note_to_payer: request.note_to_payer }),
    };
    target = capture
      ? `payment ${capture.id} (${formatUsd(capture.amountCents)} on ${capture.createdAt.toISOString().slice(0, 10)}${capture.refundedCents ? `, ${formatUsd(capture.refundedCents)} already refunded` : ''})`
      : `unknown payment ${request.capture_id}`;
    details = { capture, requestedBy: request.requested_by, paidBy: capture?.payerEmail ?? null };
  } else if (request.kind === 'invoice') {
    const amountCents = request.items.reduce((s, i) => s + toCents(i.unit_price) * i.quantity, 0);
    const knownCustomer = await isKnownCustomer(fresh.userId, request.recipient_email);
    op = { kind: 'invoice', amountCents, recipient: request.recipient_email, knownCustomer, invoicesLast24h: doneSince('invoice').length };
    paypalTool = 'create_invoice + send_invoice';
    args = {
      currency_code: 'USD',
      primary_recipients: [{ billing_info: { email_address: request.recipient_email } }],
      items: request.items.map((i) => ({ name: i.name, quantity: String(i.quantity), unit_amount: { currency_code: 'USD', value: i.unit_price.toFixed(2) } })),
      ...(request.note && { note: request.note }),
    };
    target = `invoice to ${request.recipient_email}${knownCustomer ? '' : ' (not an existing customer)'}`;
    details = { items: request.items, knownCustomer };
  } else {
    const dispute = await disputeFacts(request.dispute_id);
    op = { kind: 'accept_dispute', amountCents: dispute?.amountCents ?? 0, disputeStatus: dispute?.status ?? null };
    paypalTool = 'accept_dispute_claim';
    args = { dispute_id: request.dispute_id, note: request.note };
    target = dispute ? `dispute ${request.dispute_id} (${dispute.status})` : `unknown dispute ${request.dispute_id}`;
  }

  const engine = evaluateOp(policy, op, now);
  const audit = await auditOperation({
    agent: { name: fresh.name, role: fresh.role },
    mandateText: fresh.mandateText,
    notes: policy.notes,
    action: { kind: request.kind, amount: formatUsd(op.amountCents), target, reason: request.reason, details },
    engine,
    recent: recent.slice(0, 8).map((o) => ({ kind: o.kind, amountCents: o.amountCents, status: o.status })),
  });
  const { decision, escalated } = applyAudit(engine.decision, audit);
  const status: OperationStatus = decision === 'allow' ? 'executing' : decision === 'require_approval' ? 'pending_approval' : 'denied';

  const [row] = await db
    .insert(operations)
    .values({
      id: newId('op'),
      userId: fresh.userId,
      agentId: fresh.id,
      kind: request.kind,
      paypalTool,
      args,
      amountCents: op.amountCents,
      target,
      reason: request.reason,
      checks: engine.checks,
      engineDecision: engine.decision,
      audit,
      decision,
      decidedBy: escalated ? 'auditor' : 'policy',
      status,
      ...(status === 'pending_approval' && { approvalExpiresAt: new Date(now.getTime() + APPROVAL_TTL_MS), approvalToken: randomBytes(18).toString('base64url') }),
    })
    .returning();

  const verb = status === 'executing' ? 'auto-approved' : status === 'pending_approval' ? 'needs your approval' : 'blocked';
  await record({
    userId: row.userId,
    agentId: row.agentId,
    requestId: row.id,
    type: `op.${status}`,
    message: `${fresh.name}: ${formatUsd(op.amountCents)} ${describeKind[request.kind]} on ${target} ${verb}${escalated ? ' (escalated by AI auditor)' : ''}`,
    data: { status, decision, risk: audit.riskScore, verdict: audit.verdict },
  });

  if (status === 'pending_approval') {
    const [user] = await db.select().from(users).where(eq(users.id, row.userId));
    void pushApprovalRequest({
      topic: user.ntfyTopic,
      requestId: row.id,
      approvalToken: row.approvalToken!,
      agentName: fresh.name,
      merchantName: `${describeKind[request.kind]} on your PayPal account`,
      amountCents: op.amountCents,
      reason: escalated ? audit.explanation : (engine.checks.find((c) => c.outcome === 'approval')?.detail ?? audit.explanation),
      kind: 'operations',
    });
    return toAgentOpResult(row);
  }
  return toAgentOpResult(status === 'executing' ? await executeOperation(row) : row);
}

// ── Running it through PayPal's Agent Toolkit ──────────────────────────────────────────────

async function executeOperation(op: Operation): Promise<Operation> {
  try {
    let result: Record<string, unknown>;
    if (op.kind === 'refund') {
      const r = await callPayPalTool<any>('create_refund', op.args);
      result = { refundId: r.id, refundStatus: r.status };
    } else if (op.kind === 'invoice') {
      const created = await callPayPalTool<any>('create_invoice', op.args);
      const invoiceId: string | undefined = created.id ?? created.href?.split('/').pop();
      if (!invoiceId) throw new Error('PayPal did not return an invoice id');
      await callPayPalTool('send_invoice', { invoice_id: invoiceId, send_to_recipient: true });
      result = { invoiceId, invoiceStatus: 'SENT' };
    } else {
      const r = await callPayPalTool<any>('accept_dispute_claim', op.args);
      result = { disputeResponse: r?.links ? 'accepted' : r };
    }
    return transition(op, { status: 'done', result, approvalToken: null }, 'op.done', `PayPal Agent Toolkit ran ${op.paypalTool}: ${formatUsd(op.amountCents)} ${describeKind[op.kind]} done.`, result);
  } catch (err) {
    const message = err instanceof PayPalError ? `${err.issue}${err.debugId ? ` (debug_id ${err.debugId})` : ''}` : (err as Error).message.slice(0, 400);
    return transition(op, { status: 'failed', error: message, approvalToken: null }, 'op.failed', `PayPal rejected the ${describeKind[op.kind]}: ${message}`);
  }
}

export async function decideOperation(id: string, action: 'approve' | 'deny', via: string) {
  const op = await getOperation(id);
  if (!op) throw new Error('Action not found');
  if (op.status !== 'pending_approval') return op;
  const [agent] = await db.select().from(agents).where(eq(agents.id, op.agentId));
  if (action === 'deny' || agent.status === 'frozen') {
    return transition(op, { status: 'denied', decision: 'deny', decidedBy: 'human', approvalToken: null }, 'op.denied', `You denied ${agent.name}'s ${formatUsd(op.amountCents)} ${describeKind[op.kind]}.`, { via });
  }
  const approved = await transition(op, { status: 'executing', decision: 'allow', decidedBy: 'human', approvalToken: null }, 'op.approved', `You approved ${agent.name}'s ${formatUsd(op.amountCents)} ${describeKind[op.kind]}.`, { via });
  return executeOperation(approved);
}

export async function waitForOperation(id: string, timeoutMs: number) {
  const current = await getOperation(id);
  if (!current || current.status !== 'pending_approval') return current;
  return new Promise<Operation | null>((resolve) => {
    const finish = async () => {
      clearTimeout(timer);
      bus.off('event', onEvent);
      resolve(await getOperation(id));
    };
    const onEvent = (e: { requestId: string | null; data?: { status?: string } }) => {
      if (e.requestId === id && e.data?.status && !['pending_approval', 'executing'].includes(e.data.status)) finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    bus.on('event', onEvent);
  });
}

export async function opsSummary(agent: Agent) {
  await dbReady();
  const p = agent.opsPolicy;
  if (!p) return null;
  const since = new Date(Date.now() - DAY_MS);
  const done = await db
    .select()
    .from(operations)
    .where(and(eq(operations.agentId, agent.id), eq(operations.status, 'done'), gt(operations.createdAt, since)));
  const refunded = done.filter((o) => o.kind === 'refund').reduce((s, o) => s + o.amountCents, 0);
  const money = (d: number | null) => (d === null ? null : formatUsd(toCents(d)));
  return {
    agent: agent.name,
    status: agent.status,
    summary: p.summary,
    refunds: p.refunds.enabled
      ? {
          perRefundMax: money(p.refunds.perRefundMax),
          dailyLimit: money(p.refunds.dailyMax),
          refundedLast24h: formatUsd(refunded),
          remainingToday: p.refunds.dailyMax === null ? null : formatUsd(Math.max(toCents(p.refunds.dailyMax) - refunded, 0)),
          onlyOrdersFromLastDays: p.refunds.maxOrderAgeDays,
          fullRefundsNeedApproval: p.refunds.fullRefundsNeedApproval,
        }
      : 'not allowed',
    invoices: p.invoices.enabled
      ? { perInvoiceMax: money(p.invoices.perInvoiceMax), sentLast24h: done.filter((o) => o.kind === 'invoice').length, maxPerDay: p.invoices.dailyCount, onlyExistingCustomers: p.invoices.onlyExistingCustomers }
      : 'not allowed',
    disputes: p.disputes.acceptClaims === 'never' ? 'may never accept claims' : 'may propose accepting claims; human decides',
    notes: p.notes,
  };
}
