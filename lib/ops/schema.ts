import { z } from 'zod';
import type { Check, Decision } from '../policy/schema';

// Rules for a *business* agent: one that operates the merchant's own PayPal account through PayPal's
// Agent Toolkit (refunds, invoices, disputes) instead of spending a wallet.

const Dollars = z.number().nonnegative();

export const OpsPolicy = z.object({
  summary: z.string().describe('One sentence, plain English, describing what this agent may do on the PayPal account.'),
  refunds: z.object({
    enabled: z.boolean(),
    perRefundMax: Dollars.nullable().describe('Largest single refund. null = no cap.'),
    dailyMax: Dollars.nullable().describe('Max total refunded in any rolling 24 hours. null = no cap.'),
    requireAbove: Dollars.nullable().describe('Ask the human for refunds above this amount. null = never by amount.'),
    maxOrderAgeDays: z.number().int().positive().nullable().describe('Only refund orders captured within this many days. null = any age.'),
    fullRefundsNeedApproval: z.boolean().describe('Ask the human before refunding an order in full.'),
  }),
  invoices: z.object({
    enabled: z.boolean(),
    perInvoiceMax: Dollars.nullable().describe('Largest invoice total. null = no cap.'),
    dailyCount: z.number().int().positive().nullable().describe('Max invoices sent in any rolling 24 hours. null = no cap.'),
    requireAbove: Dollars.nullable().describe('Ask the human for invoices above this amount. null = never by amount.'),
    onlyExistingCustomers: z.boolean().describe('Ask the human before invoicing anyone who has not paid us before.'),
  }),
  disputes: z.object({
    acceptClaims: z.enum(['never', 'ask']).describe('Accepting a dispute claim gives the money back to the buyer.'),
  }),
  notes: z.array(z.string()).describe('Instructions the fields above cannot express. The AI auditor weighs these.'),
});
export type OpsPolicy = z.infer<typeof OpsPolicy>;

export type CaptureFacts = { id: string; status: string; amountCents: number; refundedCents: number; createdAt: Date; payerEmail: string | null };

export type OpInput =
  | { kind: 'refund'; amountCents: number; capture: CaptureFacts | null; refundedLast24hCents: number; requestedBy: string | null }
  | { kind: 'invoice'; amountCents: number; recipient: string; knownCustomer: boolean; invoicesLast24h: number }
  | { kind: 'accept_dispute'; amountCents: number; disputeStatus: string | null };

export type OpKind = OpInput['kind'];
export type OpResult = { decision: Decision; checks: Check[] };
