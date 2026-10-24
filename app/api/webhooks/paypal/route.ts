import { dbReady } from '@/lib/db';
import { handleWebhook } from '@/lib/payments/webhooks';
import { verifyWebhookSignature } from '@/lib/paypal/api';

// PayPal webhook receiver. Verifies the signature against the raw body, then processes idempotently.
export async function POST(req: Request) {
  await dbReady();
  const raw = await req.text();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error('[webhook] PAYPAL_WEBHOOK_ID not set; rejecting');
    return new Response('webhook not configured', { status: 503 });
  }
  const verified = await verifyWebhookSignature(req.headers, raw, webhookId).catch((err) => {
    console.error('[webhook] verification call failed:', err.message);
    return false;
  });
  if (!verified) return new Response('invalid signature', { status: 400 });

  await handleWebhook(JSON.parse(raw), true);
  return new Response('ok');
}
