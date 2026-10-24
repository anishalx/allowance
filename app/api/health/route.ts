import { connection } from 'next/server';
import { appUrl } from '@/lib/notify';
import { webhookId } from '@/lib/paypal/webhook-registry';

// Liveness probe for Render and the keep-awake ping. Reports config, never secrets.
export async function GET(req: Request) {
  await connection();
  const deep = new URL(req.url).searchParams.has('deep');
  const webhook = deep ? await Promise.race([webhookId(), new Promise<null>((r) => setTimeout(() => r(null), 8000))]) : undefined;
  return Response.json({
    ok: true,
    at: new Date().toISOString(),
    appUrl: appUrl(),
    ...(deep && { webhookConfigured: !!webhook }),
  });
}
