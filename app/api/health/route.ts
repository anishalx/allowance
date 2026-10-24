import { connection } from 'next/server';
import { secret } from '@/lib/env';
import { appUrl } from '@/lib/notify';
import { paypal } from '@/lib/paypal/client';
import { webhookId } from '@/lib/paypal/webhook-registry';

const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

// Liveness probe for Render and the keep-awake ping. `?deep` also checks PayPal; never reports secrets.
export async function GET(req: Request) {
  await connection();
  if (!new URL(req.url).searchParams.has('deep')) return Response.json({ ok: true, at: new Date().toISOString() });

  const paypalAuth = await withTimeout(
    paypal('GET', '/v1/notifications/webhooks-event-types').then(
      () => 'ok',
      (err: Error) => err.message,
    ),
    10_000,
  );
  return Response.json({
    ok: true,
    at: new Date().toISOString(),
    appUrl: appUrl(),
    paypalAuth: paypalAuth ?? 'timeout',
    paypalClientId: `${secret('PAYPAL_CLIENT_ID')?.slice(0, 8) ?? 'missing'}…`, // client ids are public; helps spot a swap
    webhookConfigured: !!(await withTimeout(webhookId(), 10_000)),
  });
}
