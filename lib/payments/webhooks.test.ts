import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

// Runs the real webhook handler against a throwaway SQLite database (migrated + seeded like the app).
process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'allowance-test-')), 'test.db')}`;

const { db, dbReady } = await import('../db');
const { agents, paymentRequests, wallets } = await import('../db/schema');
const { handleWebhook } = await import('./webhooks');

const REQUEST_ID = 'req_test_1';
const CAPTURE_ID = 'CAPTURE123';

beforeAll(async () => {
  await dbReady();
  await db.insert(wallets).values({ id: 'w_test', userId: 'u_demo', status: 'active', paymentTokenId: 'TOKEN123' });
  await db.insert(paymentRequests).values({
    id: REQUEST_ID,
    userId: 'u_demo',
    agentId: 'a_pantry',
    merchantId: 'm_freshcart',
    merchant: { id: 'm_freshcart', name: 'FreshCart Groceries', domain: 'freshcart.example', paypalEmail: 'm@example.com', category: 'groceries', verified: true },
    items: [{ name: 'Eggs', quantity: 1, unitPrice: 6, category: 'groceries' }],
    amountCents: 600,
    currency: 'USD',
    purpose: 'test',
    policyChecks: [],
    policyDecision: 'allow',
    audit: null,
    decision: 'allow',
    decidedBy: 'policy',
    status: 'processing',
  });
});

const request = async () => (await db.select().from(paymentRequests).where(eq(paymentRequests.id, REQUEST_ID)))[0];

describe('PayPal webhook handling', () => {
  it('confirms a capture from PAYMENT.CAPTURE.COMPLETED', async () => {
    const event = { id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: CAPTURE_ID, custom_id: REQUEST_ID } };
    expect(await handleWebhook(event, true)).toBe(true);
    const r = await request();
    expect(r.status).toBe('paid');
    expect(r.captureId).toBe(CAPTURE_ID);
  });

  it('ignores a redelivered event (idempotent by event id)', async () => {
    const event = { id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: CAPTURE_ID, custom_id: REQUEST_ID } };
    expect(await handleWebhook(event, true)).toBe(false);
  });

  it('freezes the agent behind a disputed capture', async () => {
    const event = {
      id: 'WH-2',
      event_type: 'CUSTOMER.DISPUTE.CREATED',
      resource: { dispute_id: 'PP-D-1', reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED', disputed_transactions: [{ seller_transaction_id: CAPTURE_ID }] },
    };
    await handleWebhook(event, true);
    const [pantry] = await db.select().from(agents).where(eq(agents.id, 'a_pantry'));
    expect(pantry.status).toBe('frozen');
  });

  it('keeps a purchase paid after a partial refund', async () => {
    const event = {
      id: 'WH-2b',
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: { id: 'REFUND0', amount: { value: '1.00' }, links: [{ rel: 'up', href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${CAPTURE_ID}` }] },
    };
    await handleWebhook(event, true);
    expect((await request()).status).toBe('paid');
  });

  it('marks a refund reported by PayPal', async () => {
    const event = {
      id: 'WH-3',
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: { id: 'REFUND1', links: [{ rel: 'up', href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${CAPTURE_ID}` }] },
    };
    await handleWebhook(event, true);
    const r = await request();
    expect(r.status).toBe('refunded');
    expect(r.refundId).toBe('REFUND1');
  });

  it('revokes the wallet when the vault token is deleted from PayPal', async () => {
    await handleWebhook({ id: 'WH-4', event_type: 'VAULT.PAYMENT-TOKEN.DELETED', resource: { id: 'TOKEN123' } }, true);
    const [w] = await db.select().from(wallets).where(eq(wallets.id, 'w_test'));
    expect(w.status).toBe('revoked');
  });
});
