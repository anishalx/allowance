import { timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agents } from '@/lib/db/schema';
import { route } from '@/lib/http';
import { getOperation } from '@/lib/ops/service';

// Read one business action for the mobile approval page. Requires the capability token from the push.
export const GET = route(async (req: Request, ctx: RouteContext<'/api/operations/[id]'>) => {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get('token');
  const op = await getOperation(id);
  const ok =
    op &&
    (op.approvalToken
      ? token && token.length === op.approvalToken.length && timingSafeEqual(Buffer.from(token), Buffer.from(op.approvalToken))
      : req.headers.get('sec-fetch-site') === 'same-origin');
  if (!op || !ok) return Response.json({ error: 'Not found or link expired' }, { status: 404 });
  const [agent] = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, op.agentId));
  const { approvalToken: _secret, ...safe } = op;
  return Response.json({
    agentName: agent?.name ?? 'Agent',
    operation: { ...safe, createdAt: op.createdAt.toISOString(), approvalExpiresAt: op.approvalExpiresAt?.toISOString() ?? null },
  });
});
