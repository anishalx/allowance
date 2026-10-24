import { after } from 'next/server';
import { dbReady } from '@/lib/db';
import { handleWebhook } from '@/lib/payments/webhooks';
import { verifyWebhookSignature } from '@/lib/paypal/api';
import { webhookId } from '@/lib/paypal/webhook-registry';

// PayPal webhook receiver. Verifies the signature against the raw body, acknowledges right away (PayPal
// retries anything slower than 30s), then processes after the response. Processing is idempotent by event id.
export async function POST(req: Request) {
  const raw = await req.text();
  const id = await webhookId();
  if (!id) {
    console.error('[webhook] no webhook id (set PAYPAL_WEBHOOK_ID or deploy on https); rejecting');
    return new Response('webhook not configured', { status: 503 });
  }
  const verified = await verifyWebhookSignature(req.headers, raw, id).catch((err) => {
    console.error('[webhook] verification call failed:', err.message);
    return false;
  });
  if (!verified) return new Response('invalid signature', { status: 400 });

  after(async () => {
    await dbReady();
    await handleWebhook(JSON.parse(raw), true).catch((err) => console.error('[webhook] processing failed:', err));
  });
  return new Response('ok');
}
