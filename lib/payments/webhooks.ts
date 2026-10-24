import { eq } from 'drizzle-orm';
import { db } from '../db';
import { agents, paymentRequests, wallets, webhookEvents } from '../db/schema';
import { record } from '../events';
import { formatUsd } from '../policy/engine';
import { syncPayout } from './service';

type WebhookEvent = { id: string; event_type: string; resource: any; summary?: string };

const byId = async (id: string | undefined) =>
  id ? (await db.select().from(paymentRequests).where(eq(paymentRequests.id, id)))[0] : undefined;
const byCapture = async (captureId: string | undefined) =>
  captureId ? (await db.select().from(paymentRequests).where(eq(paymentRequests.captureId, captureId)))[0] : undefined;

// Returns false when the event was already processed (PayPal retries until it gets a 200).
export async function handleWebhook(event: WebhookEvent, verified: boolean) {
  const inserted = await db
    .insert(webhookEvents)
    .values({ id: event.id, type: event.event_type, resourceId: event.resource?.id ?? null, verified, payload: event })
    .onConflictDoNothing()
    .returning();
  if (!inserted.length) return false;

  const r = event.resource ?? {};
  switch (event.event_type) {
    case 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED':
    case 'PAYMENT.PAYOUTS-ITEM.FAILED':
    case 'PAYMENT.PAYOUTS-ITEM.UNCLAIMED':
    case 'PAYMENT.PAYOUTS-ITEM.RETURNED': {
      const req = await byId(r.payout_item?.sender_item_id);
      if (req) await syncPayout(req.id, 99);
      break;
    }
    case 'PAYMENT.CAPTURE.COMPLETED': {
      // PayPal's asynchronous confirmation of a capture we made (custom_id = our request id).
      const req = await byId(r.custom_id ?? r.invoice_id);
      if (req) {
        if (req.status === 'processing') {
          await db.update(paymentRequests).set({ status: 'paid', captureId: r.id }).where(eq(paymentRequests.id, req.id));
        }
        await record({
          userId: req.userId,
          agentId: req.agentId,
          requestId: req.id,
          type: 'payment.confirmed',
          message: `PayPal webhook confirmed the ${formatUsd(req.amountCents)} capture at ${req.merchant.name}.`,
          data: { captureId: r.id },
        });
      }
      break;
    }
    case 'PAYMENT.CAPTURE.REFUNDED': {
      const captureId = r.links?.find((l: { rel: string }) => l.rel === 'up')?.href?.split('/').pop();
      const req = await byCapture(captureId);
      if (req && req.status !== 'refunded') {
        await db.update(paymentRequests).set({ status: 'refunded', refundId: r.id }).where(eq(paymentRequests.id, req.id));
        await record({ userId: req.userId, agentId: req.agentId, requestId: req.id, type: 'payment.refunded', message: `PayPal reports ${formatUsd(req.amountCents)} refunded.`, data: { status: 'refunded' } });
      }
      break;
    }
    case 'PAYMENT.CAPTURE.DENIED': {
      const req = await byId(r.custom_id);
      if (req) {
        await db.update(paymentRequests).set({ status: 'failed', error: 'Capture denied by PayPal' }).where(eq(paymentRequests.id, req.id));
        await record({ userId: req.userId, agentId: req.agentId, requestId: req.id, type: 'payment.failed', message: 'PayPal denied the capture.', data: { status: 'failed' } });
      }
      break;
    }
    case 'VAULT.PAYMENT-TOKEN.DELETED': {
      // The human can also unlink Allowance from inside their PayPal account; honor it immediately.
      const [w] = await db.select().from(wallets).where(eq(wallets.paymentTokenId, r.id));
      if (w && w.status === 'active') {
        await db.update(wallets).set({ status: 'revoked' }).where(eq(wallets.id, w.id));
        await record({ userId: w.userId, type: 'wallet.revoked', message: 'PayPal reports the saved wallet was removed. Agents can no longer spend.' });
      }
      break;
    }
    case 'CUSTOMER.DISPUTE.CREATED': {
      // A dispute on an agent purchase freezes that agent until the human looks at it.
      const captureIds: string[] = (r.disputed_transactions ?? []).map((t: { seller_transaction_id?: string }) => t.seller_transaction_id).filter(Boolean);
      for (const captureId of captureIds) {
        const req = await byCapture(captureId);
        if (!req) continue;
        await db.update(agents).set({ status: 'frozen' }).where(eq(agents.id, req.agentId));
        await record({
          userId: req.userId,
          agentId: req.agentId,
          requestId: req.id,
          type: 'dispute.created',
          message: `A PayPal dispute was opened on a ${formatUsd(req.amountCents)} purchase at ${req.merchant.name}. The agent is frozen until you review it.`,
          data: { disputeId: r.dispute_id, reason: r.reason },
        });
      }
      break;
    }
  }
  await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, event.id));
  return true;
}
