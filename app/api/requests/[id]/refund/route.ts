import { isMine } from '@/lib/households';
import { route } from '@/lib/http';
import { getRequest, refund, toAgentResult } from '@/lib/payments/service';

export const POST = route(async (req: Request, ctx: RouteContext<'/api/requests/[id]/refund'>) => {
  const { id } = await ctx.params;
  const r = await getRequest(id);
  if (!r || !(await isMine(r.userId))) return Response.json({ error: 'Not found' }, { status: 404 });
  const { reason } = (await req.json().catch(() => ({}))) as { reason?: string };
  const updated = await refund(id, { reason: reason?.trim() || 'Refunded by you from the dashboard', by: 'human' });
  return Response.json(toAgentResult(updated));
});
