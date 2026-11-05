import net from 'node:net';
import { webhookId } from './lib/paypal/webhook-registry';

// Node races IPv4/IPv6 with a 250 ms per-attempt budget; on slower links that aborts healthy IPv4
// connections (ETIMEDOUT) when IPv6 isn't routable. Give each attempt a realistic window instead.
net.setDefaultAutoSelectFamilyAttemptTimeout(2_500);

// On a public deployment, make sure PayPal knows where to send webhooks (no-op locally).
setTimeout(() => void webhookId(), 5_000);

// Render's free plan sleeps after 15 idle minutes, which makes the next visitor wait about a minute, and
// GitHub runs the scheduled keep-awake only every few hours. So while the server runs on Render, it pings
// its own public URL every 10 minutes. One always-on service fits in Render's 750 free hours a month.
// KEEP_AWAKE=0 turns it off.
const publicUrl = process.env.RENDER_EXTERNAL_URL;
if (publicUrl && process.env.KEEP_AWAKE !== '0') {
  // Connection: close, because a pooled connection idle for 10 minutes is long dead and would reset.
  const ping = () => fetch(`${publicUrl}/api/health`, { headers: { Connection: 'close' } });
  setInterval(() => void ping().catch(() => ping().catch(() => {})), 10 * 60_000).unref();
}
