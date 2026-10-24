import { timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agents } from '@/lib/db/schema';
import { isMine } from '@/lib/households';
import { route } from '@/lib/http';
import { getRequest } from '@/lib/payments/service';

// Read one request for the mobile approval page. Requires the capability token from the push notification.
export const GET = route(async (req: Request, ctx: RouteContext<'/api/requests/[id]'>) => {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get('token');
  const r = await getRequest(id);
  const ok = r && (r.approvalToken ? token && token.length === r.approvalToken.length && timingSafeEqual(Buffer.from(token), Buffer.from(r.approvalToken)) : req.headers.get('sec-fetch-site') === 'same-origin' && (await isMine(r.userId)));
  if (!r || !ok) return Response.json({ error: 'Not found or link expired' }, { status: 404 });
  const [agent] = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, r.agentId));
  const { approvalToken: _secret, ...safe } = r;
  return Response.json({
    agentName: agent?.name ?? 'Agent',
    request: { ...safe, createdAt: r.createdAt.toISOString(), approvalExpiresAt: r.approvalExpiresAt?.toISOString() ?? null },
  });
});
