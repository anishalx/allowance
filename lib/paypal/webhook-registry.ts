import { appUrl } from '../notify';
import { ensureWebhook } from './api';

// Resolves the PayPal webhook id used for signature verification. Uses PAYPAL_WEBHOOK_ID when set;
// otherwise, on a public https deployment, registers (or finds) the webhook for this app's URL.
let cached: Promise<string | null> | null = null;

export function webhookId() {
  if (process.env.PAYPAL_WEBHOOK_ID) return Promise.resolve(process.env.PAYPAL_WEBHOOK_ID);
  const base = appUrl();
  if (!base.startsWith('https://')) return Promise.resolve(null); // PayPal only delivers to public https URLs
  cached ??= ensureWebhook(`${base}/api/webhooks/paypal`)
    .then((id) => {
      console.log(`[webhook] PayPal webhook ready: ${id}`);
      return id;
    })
    .catch((err) => {
      console.error('[webhook] registration failed:', err.message);
      cached = null;
      return null;
    });
  return cached;
}
