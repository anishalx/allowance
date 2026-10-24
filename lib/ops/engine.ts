import { formatUsd, strictest, toCents } from '../policy/engine';
import type { Check, Decision, Outcome } from '../policy/schema';
import type { OpInput, OpResult, OpsPolicy } from './schema';

// Deterministic checks for business agents operating the merchant's PayPal account.
// Same contract as the purchase engine: deny beats approval beats allow, and the AI may only escalate.

const DAY_MS = 86_400_000;
const DECISION_FOR: Record<Outcome, Decision> = { pass: 'allow', approval: 'require_approval', deny: 'deny' };

export function evaluateOp(policy: OpsPolicy, op: OpInput, now: Date): OpResult {
  const checks: Check[] = [];
  const add = (rule: string, outcome: Outcome, detail: string) => checks.push({ rule, outcome, detail });
  const cap = (dollars: number | null) => (dollars === null ? null : toCents(dollars));

  if (op.kind === 'refund') {
    const r = policy.refunds;
    if (!r.enabled) add('refund.disabled', 'deny', 'This agent is not allowed to issue refunds.');
    const c = op.capture;
    if (!c) {
      add('refund.capture', 'deny', 'That capture does not exist on this PayPal account.');
    } else {
      if (!['COMPLETED', 'PARTIALLY_REFUNDED'].includes(c.status)) add('refund.capture', 'deny', `The payment is ${c.status.toLowerCase()} and can't be refunded.`);
      const remaining = c.amountCents - c.refundedCents;
      if (op.amountCents > remaining) add('refund.amount', 'deny', `${formatUsd(op.amountCents)} is more than the ${formatUsd(remaining)} still refundable on this payment.`);
      else add('refund.amount', 'pass', `${formatUsd(op.amountCents)} of a ${formatUsd(c.amountCents)} payment.`);
      const ageDays = Math.floor((now.getTime() - c.createdAt.getTime()) / DAY_MS);
      if (r.maxOrderAgeDays !== null && ageDays > r.maxOrderAgeDays)
        add('refund.age', 'deny', `The order is ${ageDays} days old; this agent may only refund orders from the last ${r.maxOrderAgeDays} days.`);
      if (r.fullRefundsNeedApproval && op.amountCents >= remaining && remaining > 0) add('refund.full', 'approval', 'Full refunds always need your approval.');
      if (c.payerEmail && op.requestedBy && c.payerEmail.toLowerCase() !== op.requestedBy.trim().toLowerCase())
        add('refund.requester', 'approval', `Requested by ${op.requestedBy}, but the order was paid by ${c.payerEmail}. PayPal refunds go to the payer, so a stranger asking is a red flag.`);
    }
    if (cap(r.perRefundMax) !== null && op.amountCents > cap(r.perRefundMax)!)
      add('refund.perRefund', 'deny', `${formatUsd(op.amountCents)} exceeds the ${formatUsd(cap(r.perRefundMax)!)} per-refund cap.`);
    if (cap(r.dailyMax) !== null) {
      const left = cap(r.dailyMax)! - op.refundedLast24hCents;
      if (op.amountCents > left) add('refund.daily', 'deny', `Only ${formatUsd(Math.max(left, 0))} left of the ${formatUsd(cap(r.dailyMax)!)} daily refund budget.`);
      else add('refund.daily', 'pass', `${formatUsd(left - op.amountCents)} of the daily refund budget left after this.`);
    }
    if (cap(r.requireAbove) !== null && op.amountCents > cap(r.requireAbove)!)
      add('refund.approval', 'approval', `Above the ${formatUsd(cap(r.requireAbove)!)} auto-approve threshold.`);
  }

  if (op.kind === 'invoice') {
    const inv = policy.invoices;
    if (!inv.enabled) add('invoice.disabled', 'deny', 'This agent is not allowed to send invoices.');
    if (cap(inv.perInvoiceMax) !== null && op.amountCents > cap(inv.perInvoiceMax)!)
      add('invoice.perInvoice', 'deny', `${formatUsd(op.amountCents)} exceeds the ${formatUsd(cap(inv.perInvoiceMax)!)} per-invoice cap.`);
    if (inv.dailyCount !== null && op.invoicesLast24h >= inv.dailyCount)
      add('invoice.daily', 'deny', `Already sent ${op.invoicesLast24h} invoices in the last 24 hours (limit ${inv.dailyCount}).`);
    if (inv.onlyExistingCustomers && !op.knownCustomer)
      add('invoice.newRecipient', 'approval', `${op.recipient} has never paid us before.`);
    else add('invoice.recipient', 'pass', `${op.recipient} is an existing customer.`);
    if (cap(inv.requireAbove) !== null && op.amountCents > cap(inv.requireAbove)!)
      add('invoice.approval', 'approval', `Above the ${formatUsd(cap(inv.requireAbove)!)} auto-approve threshold.`);
  }

  if (op.kind === 'accept_dispute') {
    if (policy.disputes.acceptClaims === 'never') add('dispute.never', 'deny', 'This agent may never accept a dispute claim.');
    else add('dispute.ask', 'approval', `Accepting the claim returns ${formatUsd(op.amountCents)} to the buyer; you decide.`);
    if (op.disputeStatus && ['RESOLVED', 'CLOSED'].includes(op.disputeStatus)) add('dispute.status', 'deny', `The dispute is already ${op.disputeStatus.toLowerCase()}.`);
  }

  return { decision: DECISION_FOR[strictest(checks.map((c) => c.outcome))], checks };
}
