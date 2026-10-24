import { timingSafeEqual } from 'node:crypto';
import { route } from '@/lib/http';
import { appUrl } from '@/lib/notify';
import { decide, getRequest, toAgentResult } from '@/lib/payments/service';

const sameOrigin = (req: Request) =>
  req.headers.get('sec-fetch-site') === 'same-origin' || req.headers.get('origin') === new URL(appUrl()).origin;

const tokenMatches = (given: string | null, expected: string | null) =>
  !!given && !!expected && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));

// Approve or deny a pending purchase: from the dashboard (same origin) or a one-tap phone link (capability token).
export const POST = route(async (req: Request, ctx: RouteContext<'/api/requests/[id]/decision'>) => {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const body = req.headers.get('content-type')?.includes('json') ? await req.json() : {};
  const action = (body.action ?? url.searchParams.get('action')) as string;
  if (action !== 'approve' && action !== 'deny') return Response.json({ error: 'action must be approve or deny' }, { status: 400 });

  const r = await getRequest(id);
  if (!r) return Response.json({ error: 'Not found' }, { status: 404 });
  const viaToken = tokenMatches(body.token ?? url.searchParams.get('token'), r.approvalToken);
  if (!viaToken && !sameOrigin(req)) return Response.json({ error: 'Not allowed' }, { status: 403 });

  const updated = await decide(id, action, viaToken ? 'phone' : 'dashboard');
  return Response.json(toAgentResult(updated));
});
