import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { applyAudit, auditRequest } from '../ai/auditor';
import { newId } from '../agents/keys';
import { db, dbReady } from '../db';
import {
  agents,
  merchants,
  paymentRequests,
  users,
  wallets,
  type Agent,
  type MerchantSnapshot,
  type PaymentRequest,
  type RequestStatus,
} from '../db/schema';
import { bus, record } from '../events';
import { pushApprovalRequest } from '../notify';
import { chargeVaultedWallet, getPayoutBatch, payMerchant, refundCapture } from '../paypal/api';
import { PayPalError } from '../paypal/client';
import { evaluate, findLookalike, formatUsd, merchantMatches, toCents } from '../policy/engine';
import { LineItem, type Category, type SpendRecord } from '../policy/schema';

const APPROVAL_TTL_MS = 15 * 60 * 1000;
const SPENT_STATUSES: RequestStatus[] = ['processing', 'paid', 'settled'];

export const PaymentRequestInput = z.object({
  merchant: z.string().min(1).describe('Merchant name or domain, e.g. "FreshCart Groceries" or "freshcart.example".'),
  payeePaypalEmail: z
    .email()
    .optional()
    .describe('Only for a merchant that is not in the Allowance directory: the PayPal email to pay.'),
  items: z.array(LineItem).min(1).max(50).describe('Every line item in the cart, with the category that best fits it.'),
  total: z.number().positive().describe('Cart total in US dollars. Must equal the sum of the line items.'),
  currency: z.literal('USD').default('USD'),
  purpose: z.string().min(1).max(1000).describe('One or two sentences on why you are buying this, for your human.'),
});
export type PaymentRequestInput = z.infer<typeof PaymentRequestInput>;

// Serialize decisions per agent so two concurrent requests can't both squeeze under a limit.
const locks = new Map<string, Promise<unknown>>();
function withAgentLock<T>(agentId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(agentId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(agentId, next);
  return next.finally(() => locks.get(agentId) === next && locks.delete(agentId));
}

async function activeWallet(userId: string) {
  const [w] = await db.select().from(wallets).where(and(eq(wallets.userId, userId), eq(wallets.status, 'active'))).limit(1);
  return w ?? null;
}

async function resolveMerchant(input: PaymentRequestInput): Promise<MerchantSnapshot> {
  const directory = await db.select().from(merchants);
  const known = directory.find((m) => m.id === input.merchant || merchantMatches(input.merchant, m.name, m.domain));
  if (known) {
    const asked = input.payeePaypalEmail?.trim().toLowerCase();
    return {
      id: known.id,
      name: known.name,
      domain: known.domain,
      paypalEmail: known.paypalEmail, // always the directory's payee, never the agent's
      category: known.category,
      verified: known.verified,
      requestedPayee: asked && asked !== known.paypalEmail.toLowerCase() ? input.payeePaypalEmail! : null,
    };
  }
  // Unknown payee: categorize by the cart, and never trust it automatically (the engine requires approval).
  const counts = new Map<Category, number>();
  for (const i of input.items) counts.set(i.category, (counts.get(i.category) ?? 0) + i.quantity);
  const category = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const domain = /^[\w.-]+\.[a-z]{2,}$/i.test(input.merchant) ? input.merchant.toLowerCase() : null;
  const paypalEmail = input.payeePaypalEmail ?? null;
  const lookalikeOf = findLookalike({ name: input.merchant, domain, email: paypalEmail }, directory);
  return { id: null, name: input.merchant, domain, paypalEmail, category, verified: false, lookalikeOf };
}

const spendRecords = (rows: PaymentRequest[]): SpendRecord[] =>
  rows.flatMap((r) =>
    r.items.map((i) => ({ amountCents: toCents(i.unitPrice) * i.quantity, category: i.category, merchantId: r.merchantId, at: r.createdAt })),
  );

export type AgentPaymentResult = {
  requestId: string;
  status: RequestStatus;
  decision: PaymentRequest['decision'];
  decidedBy: PaymentRequest['decidedBy'];
  message: string;
  reasons: string[];
  amount: string;
  merchant: string;
  approvalExpiresAt?: string;
  paypal?: { orderId: string | null; captureId: string | null; payoutBatchId: string | null };
};

export function toAgentResult(r: PaymentRequest): AgentPaymentResult {
  const reasons = [
    ...r.policyChecks.filter((c) => c.outcome !== 'pass').map((c) => c.detail),
    ...(r.audit && r.audit.verdict !== 'consistent' ? [`Auditor: ${r.audit.explanation}`] : []),
  ];
  const messages: Record<RequestStatus, string> = {
    pending_approval: 'Waiting for your human to approve. Call get_payment_status with this request_id to check again; do not resubmit.',
    denied: 'Denied. Do not retry or work around this purchase; tell your human what you tried to buy and why it was blocked.',
    expired: 'Your human did not respond in time, so the request expired. Ask them directly before trying again.',
    processing: 'Approved. Charging the PayPal wallet now.',
    paid: 'Paid. The PayPal wallet was charged and the merchant payout is on its way.',
    settled: 'Paid and settled with the merchant.',
    failed: `Payment failed at PayPal${r.error ? `: ${r.error}` : ''}. Tell your human; do not retry automatically.`,
    refunded: 'This purchase was refunded to the PayPal wallet.',
  };
  return {
    requestId: r.id,
    status: r.status,
    decision: r.decision,
    decidedBy: r.decidedBy,
    message: messages[r.status],
    reasons,
    amount: formatUsd(r.amountCents),
    merchant: r.merchant.name,
    ...(r.status === 'pending_approval' && r.approvalExpiresAt && { approvalExpiresAt: r.approvalExpiresAt.toISOString() }),
    ...(r.paypalOrderId && { paypal: { orderId: r.paypalOrderId, captureId: r.captureId, payoutBatchId: r.payoutBatchId } }),
  };
}

export async function getRequest(id: string) {
  await dbReady();
  const [r] = await db.select().from(paymentRequests).where(eq(paymentRequests.id, id)).limit(1);
  if (r?.status === 'pending_approval' && r.approvalExpiresAt && r.approvalExpiresAt < new Date()) {
    return (await transition(r, { status: 'expired', decision: 'deny', decidedBy: 'timeout' }, 'request.expired', 'Approval window expired.')) ?? r;
  }
  return r ?? null;
}

async function transition(r: PaymentRequest, patch: Partial<PaymentRequest>, type: string, message: string, data?: Record<string, unknown>) {
  const [updated] = await db.update(paymentRequests).set(patch).where(eq(paymentRequests.id, r.id)).returning();
  await record({ userId: r.userId, agentId: r.agentId, requestId: r.id, type, message, data: { status: updated.status, ...data } });
  return updated;
}

// ── The main entry point: an agent asks to spend ───────────────────────────────────────────

export async function requestPayment(agent: Agent, raw: unknown): Promise<AgentPaymentResult> {
  await dbReady();
  const input = PaymentRequestInput.parse(raw);
  return withAgentLock(agent.id, async () => {
    const [fresh] = await db.select().from(agents).where(eq(agents.id, agent.id));
    const [user] = await db.select().from(users).where(eq(users.id, fresh.userId));
    const wallet = await activeWallet(fresh.userId);
    const merchant = await resolveMerchant(input);
    const totalCents = toCents(input.total);
    const now = new Date();

    const history = await db
      .select()
      .from(paymentRequests)
      .where(and(eq(paymentRequests.agentId, fresh.id), inArray(paymentRequests.status, SPENT_STATUSES)))
      .orderBy(desc(paymentRequests.createdAt));
    const knownMerchantIds = new Set(history.map((h) => h.merchantId).filter((id): id is string => !!id));

    const engine = evaluate({ policy: fresh.policy, merchant, items: input.items, totalCents, currency: input.currency, now, history: spendRecords(history), knownMerchantIds });

    // Preconditions that no rule can override.
    if (fresh.status === 'frozen') engine.checks.unshift({ rule: 'agent.frozen', outcome: 'deny', detail: `${fresh.name} is frozen by its human.` });
    if (!wallet) engine.checks.unshift({ rule: 'wallet.missing', outcome: 'deny', detail: 'No PayPal wallet is linked yet.' });
    if (!merchant.paypalEmail) engine.checks.unshift({ rule: 'merchant.payee', outcome: 'deny', detail: `No PayPal payee for ${merchant.name}.` });
    if (engine.checks.some((c) => c.rule.startsWith('agent.') || c.rule.startsWith('wallet.') || c.rule === 'merchant.payee')) engine.decision = 'deny';

    const audit = await auditRequest({
      agent: { name: fresh.name, role: fresh.role },
      mandateText: fresh.mandateText,
      policy: fresh.policy,
      merchant,
      items: input.items,
      totalCents,
      purpose: input.purpose,
      engine,
      recent: history.slice(0, 8).map((h) => ({ merchant: h.merchant.name, amountCents: h.amountCents, status: h.status, at: h.createdAt })),
    });
    const { decision, escalated } = applyAudit(engine.decision, audit);
    const status: RequestStatus = decision === 'allow' ? 'processing' : decision === 'require_approval' ? 'pending_approval' : 'denied';

    const [req] = await db
      .insert(paymentRequests)
      .values({
        id: newId('req'),
        userId: fresh.userId,
        agentId: fresh.id,
        merchantId: merchant.id,
        merchant,
        items: input.items,
        amountCents: totalCents,
        currency: input.currency,
        purpose: input.purpose,
        policyChecks: engine.checks,
        policyDecision: engine.decision,
        audit,
        decision,
        decidedBy: escalated ? 'auditor' : 'policy',
        status,
        ...(status === 'pending_approval' && {
          approvalExpiresAt: new Date(now.getTime() + APPROVAL_TTL_MS),
          approvalToken: randomBytes(18).toString('base64url'),
        }),
      })
      .returning();

    const verb = status === 'processing' ? 'auto-approved' : status === 'pending_approval' ? 'needs your approval' : 'blocked';
    await record({
      userId: req.userId,
      agentId: req.agentId,
      requestId: req.id,
      type: `request.${status}`,
      message: `${fresh.name} → ${merchant.name} ${formatUsd(totalCents)} ${verb}${escalated ? ' (escalated by AI auditor)' : ''}`,
      data: { status, decision, risk: audit.riskScore, verdict: audit.verdict },
    });

    if (status === 'pending_approval') {
      const reason = req.policyChecks.find((c) => c.outcome === 'approval')?.detail ?? audit.explanation;
      // Fire-and-forget: a slow push service must never delay the agent's answer.
      void pushApprovalRequest({
        topic: user.ntfyTopic,
        requestId: req.id,
        approvalToken: req.approvalToken!,
        agentName: fresh.name,
        merchantName: merchant.name,
        amountCents: totalCents,
        reason: escalated ? audit.explanation : reason,
      });
      return toAgentResult(req);
    }
    if (status === 'processing') return toAgentResult(await execute(req));
    return toAgentResult(req);
  });
}

// ── Money movement ─────────────────────────────────────────────────────────────────────────

// PayPal outcomes a human can act on. None of these are retried: a decline needs a person, not another attempt.
const PAYPAL_ISSUES: Record<string, string> = {
  INSTRUMENT_DECLINED: 'PayPal declined the funding source on the linked wallet. The account holder needs to update their PayPal payment method.',
  TRANSACTION_REFUSED: 'PayPal refused this transaction in its risk checks.',
  PAYER_ACTION_REQUIRED: 'PayPal needs the account holder to re-approve the saved wallet. Re-link PayPal on the dashboard.',
  PAYER_CANNOT_PAY: 'The linked PayPal account cannot pay right now (no usable funding source).',
  PAYEE_ACCOUNT_RESTRICTED: 'The merchant\'s PayPal account is restricted and cannot receive this payment.',
};

async function execute(req: PaymentRequest): Promise<PaymentRequest> {
  const wallet = await activeWallet(req.userId);
  const [agent] = await db.select().from(agents).where(eq(agents.id, req.agentId));
  if (!wallet?.paymentTokenId) {
    return transition(req, { status: 'failed', error: 'No PayPal wallet linked' }, 'payment.failed', 'No PayPal wallet linked.');
  }
  try {
    const charge = await chargeVaultedWallet({
      paymentTokenId: wallet.paymentTokenId,
      requestId: req.id,
      amountCents: req.amountCents,
      description: `${agent.name} (Allowance agent) at ${req.merchant.name}`,
      items: req.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPriceCents: toCents(i.unitPrice) })),
    });
    if (charge.captureStatus !== 'COMPLETED' && charge.captureStatus !== 'PENDING') {
      const error = charge.orderStatus === 'PAYER_ACTION_REQUIRED' ? PAYPAL_ISSUES.PAYER_ACTION_REQUIRED : `PayPal capture ${charge.captureStatus ?? charge.orderStatus}.`;
      return transition(req, { status: 'failed', paypalOrderId: charge.orderId, error }, 'payment.failed', error);
    }
    let paid = await transition(
      req,
      { status: 'paid', paypalOrderId: charge.orderId, captureId: charge.captureId ?? null },
      'payment.captured',
      `Charged ${formatUsd(req.amountCents)} to the linked PayPal wallet.`,
      { orderId: charge.orderId, captureId: charge.captureId },
    );

    const payout = await payMerchant({
      requestId: req.id,
      email: req.merchant.paypalEmail!,
      amountCents: req.amountCents,
      note: `${agent.name} via Allowance: ${req.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}`.slice(0, 500),
    });
    paid = await transition(
      paid,
      { payoutBatchId: payout.batchId, payoutStatus: payout.batchStatus },
      'payout.created',
      `Payout of ${formatUsd(req.amountCents)} to ${req.merchant.name} submitted.`,
      { batchId: payout.batchId },
    );
    // Webhooks settle this in production; polling covers local dev where PayPal can't reach us.
    setTimeout(() => syncPayout(req.id).catch(() => {}), 8_000);
    return paid;
  } catch (err) {
    const message =
      err instanceof PayPalError
        ? `${PAYPAL_ISSUES[err.issue] ?? err.issue}${err.debugId ? ` (debug_id ${err.debugId})` : ''}`
        : (err as Error).message;
    const [current] = await db.select().from(paymentRequests).where(eq(paymentRequests.id, req.id));
    // A failed payout after a successful charge is a settlement problem, not a failed purchase.
    if (current.status === 'paid') return transition(current, { payoutStatus: 'FAILED', error: message }, 'payout.failed', `Merchant payout failed: ${message}`);
    return transition(current, { status: 'failed', error: message }, 'payment.failed', `PayPal error: ${message}`);
  }
}

const PAYOUT_FAILED = ['FAILED', 'RETURNED', 'BLOCKED', 'REFUNDED', 'REVERSED', 'DENIED'];

export async function syncPayout(requestId: string, attempt = 1) {
  const r = await getRequest(requestId);
  if (!r?.payoutBatchId || r.status !== 'paid') return r;
  const { itemStatus, feeCents } = await getPayoutBatch(r.payoutBatchId);
  if (itemStatus === 'SUCCESS') {
    return transition(r, { status: 'settled', payoutStatus: 'SUCCESS', payoutFeeCents: feeCents ?? null }, 'payout.settled', `${r.merchant.name} received ${formatUsd(r.amountCents)} via PayPal Payouts.`);
  }
  if (itemStatus && PAYOUT_FAILED.includes(itemStatus)) {
    return transition(r, { payoutStatus: itemStatus }, 'payout.failed', `Payout to ${r.merchant.name} ${itemStatus.toLowerCase()}.`);
  }
  // Still in flight (PENDING / UNCLAIMED / ONHOLD): record it and check again with backoff.
  const [updated] = await db.update(paymentRequests).set({ payoutStatus: itemStatus ?? r.payoutStatus }).where(eq(paymentRequests.id, r.id)).returning();
  if (attempt < 8) setTimeout(() => syncPayout(requestId, attempt + 1).catch(() => {}), Math.min(10_000 * attempt, 60_000));
  return updated;
}

// ── Human decisions and refunds ────────────────────────────────────────────────────────────

export async function decide(requestId: string, action: 'approve' | 'deny', via: string) {
  const r = await getRequest(requestId);
  if (!r) throw new Error('Request not found');
  if (r.status !== 'pending_approval') return r;
  const [agent] = await db.select().from(agents).where(eq(agents.id, r.agentId));
  if (action === 'deny' || agent.status === 'frozen') {
    return transition(r, { status: 'denied', decision: 'deny', decidedBy: 'human', approvalToken: null }, 'request.denied', `You denied ${agent.name}'s ${formatUsd(r.amountCents)} purchase at ${r.merchant.name}.`, { via });
  }
  const approved = await transition(r, { status: 'processing', decision: 'allow', decidedBy: 'human', approvalToken: null }, 'request.approved', `You approved ${agent.name}'s ${formatUsd(r.amountCents)} purchase at ${r.merchant.name}.`, { via });
  return withAgentLock(r.agentId, () => execute(approved));
}

export async function refund(requestId: string, opts: { reason: string; by: 'agent' | 'human'; agentId?: string }) {
  const r = await getRequest(requestId);
  if (!r) throw new Error('Request not found');
  if (opts.agentId && r.agentId !== opts.agentId) throw new Error('That request belongs to a different agent');
  if (!r.captureId || !['paid', 'settled'].includes(r.status)) throw new Error(`Cannot refund a request that is ${r.status}`);
  const res = await refundCapture({ captureId: r.captureId, requestId: r.id, note: opts.reason });
  return transition(r, { status: 'refunded', refundId: res.refundId }, 'payment.refunded', `Refunded ${formatUsd(r.amountCents)} to the PayPal wallet (${opts.by}: ${opts.reason}).`, { refundId: res.refundId });
}

// Long-poll used by agents: resolves when the human decides or the timeout passes.
export async function waitForDecision(requestId: string, timeoutMs: number) {
  const settledStates: RequestStatus[] = ['denied', 'expired', 'paid', 'settled', 'failed', 'refunded'];
  const current = await getRequest(requestId);
  if (!current || current.status !== 'pending_approval') return current;
  return new Promise<PaymentRequest | null>((resolve) => {
    const done = async () => {
      clearTimeout(timer);
      bus.off('event', onEvent);
      resolve(await getRequest(requestId));
    };
    const onEvent = (e: { requestId: string | null; data?: { status?: RequestStatus } }) => {
      if (e.requestId === requestId && e.data?.status && settledStates.includes(e.data.status)) done();
    };
    const timer = setTimeout(done, timeoutMs);
    bus.on('event', onEvent);
  });
}

// ── Read models for agents and the dashboard ───────────────────────────────────────────────

export async function allowanceSummary(agent: Agent) {
  await dbReady();
  const rows = await db
    .select()
    .from(paymentRequests)
    .where(and(eq(paymentRequests.agentId, agent.id), inArray(paymentRequests.status, SPENT_STATUSES)));
  const now = Date.now();
  const spent = (days: number) => rows.filter((r) => r.createdAt.getTime() > now - days * 86_400_000).reduce((s, r) => s + r.amountCents, 0);
  const { limits, approval, categories } = agent.policy;
  const window = (cap: number | null, days: number) =>
    cap === null ? null : { limit: formatUsd(toCents(cap)), spent: formatUsd(spent(days)), remaining: formatUsd(Math.max(toCents(cap) - spent(days), 0)) };
  const wallet = await activeWallet(agent.userId);
  return {
    agent: agent.name,
    status: agent.status,
    walletLinked: !!wallet,
    summary: agent.policy.summary,
    perPurchaseMax: limits.perPurchaseMax === null ? null : formatUsd(toCents(limits.perPurchaseMax)),
    autoApproveUpTo: approval.requireAbove === null ? null : formatUsd(toCents(approval.requireAbove)),
    daily: window(limits.daily, 1),
    weekly: window(limits.weekly, 7),
    monthly: window(limits.monthly, 30),
    allowedCategories: categories.allowed,
    blockedCategories: categories.blocked,
    askFirstFor: categories.approvalRequired,
    notes: agent.policy.notes,
  };
}
