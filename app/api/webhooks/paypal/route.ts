import { dbReady } from '@/lib/db';
import { handleWebhook } from '@/lib/payments/webhooks';
import { verifyWebhookSignature } from '@/lib/paypal/api';
import { webhookId } from '@/lib/paypal/webhook-registry';

// PayPal webhook receiver. Verifies the signature against the raw body, then processes idempotently.
export async function POST(req: Request) {
  await dbReady();
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

  await handleWebhook(JSON.parse(raw), true);
  return new Response('ok');
}
