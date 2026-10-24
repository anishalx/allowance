import { describe, expect, it } from 'vitest';
import { evaluateOp } from './engine';
import type { CaptureFacts, OpsPolicy } from './schema';

const policy: OpsPolicy = {
  summary: 'Refunds up to $25 each and $60 a day for recent orders; invoices to existing customers up to $200.',
  refunds: { enabled: true, perRefundMax: 25, dailyMax: 60, requireAbove: null, maxOrderAgeDays: 30, fullRefundsNeedApproval: true },
  invoices: { enabled: true, perInvoiceMax: 200, dailyCount: 5, requireAbove: 100, onlyExistingCustomers: true },
  disputes: { acceptClaims: 'never' },
  notes: [],
};
const now = new Date('2026-10-24T12:00:00Z');
const capture = (over: Partial<CaptureFacts> = {}): CaptureFacts => ({
  id: 'CAP1',
  status: 'COMPLETED',
  amountCents: 22_49,
  refundedCents: 0,
  createdAt: new Date('2026-10-23T12:00:00Z'),
  payerEmail: 'sam@example.com',
  ...over,
});
const rule = (r: ReturnType<typeof evaluateOp>, id: string) => r.checks.find((c) => c.rule === id)?.outcome;

describe('business operations engine', () => {
  it('allows a small partial refund on a recent order', () => {
    expect(evaluateOp(policy, { kind: 'refund', amountCents: 6_00, capture: capture(), refundedLast24hCents: 0, requestedBy: 'sam@example.com' }, now).decision).toBe('allow');
  });

  it('asks before a full refund', () => {
    const r = evaluateOp(policy, { kind: 'refund', amountCents: 22_49, capture: capture(), refundedLast24hCents: 0, requestedBy: 'sam@example.com' }, now);
    expect(r.decision).toBe('require_approval');
    expect(rule(r, 'refund.full')).toBe('approval');
  });

  it('denies refunds above what was paid, the per-refund cap, or the daily budget', () => {
    expect(rule(evaluateOp(policy, { kind: 'refund', amountCents: 30_00, capture: capture(), refundedLast24hCents: 0, requestedBy: 'sam@example.com' }, now), 'refund.amount')).toBe('deny');
    const big = capture({ amountCents: 100_00 });
    expect(rule(evaluateOp(policy, { kind: 'refund', amountCents: 40_00, capture: big, refundedLast24hCents: 0, requestedBy: 'sam@example.com' }, now), 'refund.perRefund')).toBe('deny');
    expect(rule(evaluateOp(policy, { kind: 'refund', amountCents: 10_00, capture: big, refundedLast24hCents: 55_00, requestedBy: 'sam@example.com' }, now), 'refund.daily')).toBe('deny');
  });

  it('denies unknown, already-refunded and old payments', () => {
    expect(evaluateOp(policy, { kind: 'refund', amountCents: 1_00, capture: null, refundedLast24hCents: 0, requestedBy: 'sam@example.com' }, now).decision).toBe('deny');
    expect(evaluateOp(policy, { kind: 'refund', amountCents: 1_00, capture: capture({ status: 'REFUNDED' }), refundedLast24hCents: 0, requestedBy: 'sam@example.com' }, now).decision).toBe('deny');
    const old = capture({ createdAt: new Date('2026-08-01T00:00:00Z') });
    expect(rule(evaluateOp(policy, { kind: 'refund', amountCents: 1_00, capture: old, refundedLast24hCents: 0, requestedBy: 'sam@example.com' }, now), 'refund.age')).toBe('deny');
  });

  it('flags refunds requested by someone other than the payer', () => {
    const r = evaluateOp(policy, { kind: 'refund', amountCents: 5_00, capture: capture(), refundedLast24hCents: 0, requestedBy: 'jordan@inbox.example' }, now);
    expect(r.decision).toBe('require_approval');
    expect(rule(r, 'refund.requester')).toBe('approval');
  });

  it('asks before invoicing someone who has never paid us', () => {
    const r = evaluateOp(policy, { kind: 'invoice', amountCents: 50_00, recipient: 'accounts@unknown.example', knownCustomer: false, invoicesLast24h: 0 }, now);
    expect(r.decision).toBe('require_approval');
    expect(rule(r, 'invoice.newRecipient')).toBe('approval');
  });

  it('denies oversized invoices and enforces the daily count', () => {
    expect(evaluateOp(policy, { kind: 'invoice', amountCents: 1_950_00, recipient: 'a@b.example', knownCustomer: true, invoicesLast24h: 0 }, now).decision).toBe('deny');
    expect(evaluateOp(policy, { kind: 'invoice', amountCents: 10_00, recipient: 'a@b.example', knownCustomer: true, invoicesLast24h: 5 }, now).decision).toBe('deny');
  });

  it('never lets the agent accept a dispute when the rules say never', () => {
    expect(evaluateOp(policy, { kind: 'accept_dispute', amountCents: 22_49, disputeStatus: 'OPEN' }, now).decision).toBe('deny');
    const ask = { ...policy, disputes: { acceptClaims: 'ask' as const } };
    expect(evaluateOp(ask, { kind: 'accept_dispute', amountCents: 22_49, disputeStatus: 'OPEN' }, now).decision).toBe('require_approval');
  });
});
