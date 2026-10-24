import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import type { Category, Check, Decision, LineItem, Policy } from '../policy/schema';
import type { OpKind, OpsPolicy } from '../ops/schema';
import type { AuditVerdict } from '../ai/auditor';

const id = () => text('id').primaryKey();
const createdAt = () => integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date());
const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());

export const users = sqliteTable('users', {
  id: id(),
  name: text('name').notNull(),
  ntfyTopic: text('ntfy_topic'), // optional phone push via ntfy.sh
  createdAt: createdAt(),
});

export const wallets = sqliteTable('wallets', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id),
  status: text('status', { enum: ['pending', 'active', 'revoked'] }).notNull(),
  setupTokenId: text('setup_token_id'),
  paymentTokenId: text('payment_token_id'),
  customerId: text('customer_id'),
  payerEmail: text('payer_email'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const agents = sqliteTable('agents', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  role: text('role').notNull(), // what the human says this agent is for; the auditor checks purchases against it
  kind: text('kind', { enum: ['shopper', 'business'] }).notNull().default('shopper'), // business = operates our PayPal account
  status: text('status', { enum: ['active', 'frozen'] }).notNull().default('active'),
  apiKeyHash: text('api_key_hash').notNull(),
  apiKeyPrefix: text('api_key_prefix').notNull(),
  mandateText: text('mandate_text').notNull(),
  policy: text('policy', { mode: 'json' }).$type<Policy>().notNull(),
  opsPolicy: text('ops_policy', { mode: 'json' }).$type<OpsPolicy | null>(),
  policyVersion: integer('policy_version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const merchants = sqliteTable('merchants', {
  id: id(),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  paypalEmail: text('paypal_email').notNull(),
  category: text('category').$type<Category>().notNull(),
  description: text('description').notNull(),
  verified: integer('verified', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
});

export type MerchantSnapshot = {
  id: string | null;
  name: string;
  domain: string | null;
  paypalEmail: string | null;
  category: Category;
  verified: boolean;
  lookalikeOf?: string | null;
  requestedPayee?: string | null;
};

export const REQUEST_STATUSES = [
  'pending_approval', // waiting for the human
  'denied', // by policy, auditor, or human
  'expired', // human never answered
  'processing', // approved; charging the wallet
  'paid', // wallet charged, merchant payout in flight
  'settled', // merchant payout succeeded
  'failed',
  'refunded',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const paymentRequests = sqliteTable(
  'payment_requests',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id),
    agentId: text('agent_id').notNull().references(() => agents.id),
    merchantId: text('merchant_id').references(() => merchants.id),
    merchant: text('merchant', { mode: 'json' }).$type<MerchantSnapshot>().notNull(),
    items: text('items', { mode: 'json' }).$type<LineItem[]>().notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    purpose: text('purpose').notNull(),
    policyChecks: text('policy_checks', { mode: 'json' }).$type<Check[]>().notNull(),
    policyDecision: text('policy_decision').$type<Decision>().notNull(),
    audit: text('audit', { mode: 'json' }).$type<AuditVerdict | null>(),
    decision: text('decision').$type<Decision>().notNull(),
    decidedBy: text('decided_by', { enum: ['policy', 'auditor', 'human', 'timeout'] }).notNull(),
    status: text('status', { enum: REQUEST_STATUSES }).notNull(),
    approvalExpiresAt: integer('approval_expires_at', { mode: 'timestamp_ms' }),
    approvalToken: text('approval_token'), // capability for one-tap approve/deny links (phone push)
    paypalOrderId: text('paypal_order_id'),
    captureId: text('capture_id'),
    payoutBatchId: text('payout_batch_id'),
    payoutStatus: text('payout_status'),
    payoutFeeCents: integer('payout_fee_cents'),
    refundId: text('refund_id'),
    error: text('error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('requests_agent_idx').on(t.agentId, t.createdAt), index('requests_capture_idx').on(t.captureId)],
);

export const OPERATION_STATUSES = ['pending_approval', 'denied', 'expired', 'executing', 'done', 'failed'] as const;
export type OperationStatus = (typeof OPERATION_STATUSES)[number];

// A business agent's action on the merchant's PayPal account (via PayPal's Agent Toolkit), with its decision trace.
export const operations = sqliteTable(
  'operations',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id),
    agentId: text('agent_id').notNull().references(() => agents.id),
    kind: text('kind').$type<OpKind>().notNull(),
    paypalTool: text('paypal_tool').notNull(), // the Agent Toolkit tool that runs if allowed
    args: text('args', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    amountCents: integer('amount_cents').notNull(),
    target: text('target').notNull(), // human-readable: "capture 6AJ7… ($28.40, Oct 24)" or "invoice to a@b"
    reason: text('reason').notNull(),
    checks: text('checks', { mode: 'json' }).$type<Check[]>().notNull(),
    engineDecision: text('engine_decision').$type<Decision>().notNull(),
    audit: text('audit', { mode: 'json' }).$type<AuditVerdict | null>(),
    decision: text('decision').$type<Decision>().notNull(),
    decidedBy: text('decided_by', { enum: ['policy', 'auditor', 'human', 'timeout'] }).notNull(),
    status: text('status', { enum: OPERATION_STATUSES }).notNull(),
    approvalExpiresAt: integer('approval_expires_at', { mode: 'timestamp_ms' }),
    approvalToken: text('approval_token'),
    result: text('result', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    error: text('error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('operations_agent_idx').on(t.agentId, t.createdAt)],
);

export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    agentId: text('agent_id'),
    requestId: text('request_id'),
    type: text('type').notNull(),
    message: text('message').notNull(),
    data: text('data', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('events_user_idx').on(t.userId, t.id)],
);

export const webhookEvents = sqliteTable('webhook_events', {
  id: id(), // PayPal event id — the primary key makes handling idempotent
  type: text('type').notNull(),
  resourceId: text('resource_id'),
  verified: integer('verified', { mode: 'boolean' }).notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
  receivedAt: createdAt(),
  processedAt: integer('processed_at', { mode: 'timestamp_ms' }),
});

export type User = typeof users.$inferSelect;
export type Wallet = typeof wallets.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type Merchant = typeof merchants.$inferSelect;
export type PaymentRequest = typeof paymentRequests.$inferSelect;
export type Operation = typeof operations.$inferSelect;
export type EventRow = typeof events.$inferSelect;
