import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { currentUserId } from '@/lib/dashboard';
import { db, dbReady } from '@/lib/db';
import { agents } from '@/lib/db/schema';
import { record } from '@/lib/events';
import { route } from '@/lib/http';
import { Policy } from '@/lib/policy/schema';

const UpdateAgent = z.object({
  status: z.enum(['active', 'frozen']).optional(),
  mandateText: z.string().trim().min(3).max(2000).optional(),
  policy: Policy.optional(),
});

export const PATCH = route(async (req: Request, ctx: RouteContext<'/api/agents/[id]'>) => {
  await dbReady();
  const { id } = await ctx.params;
  const patch = UpdateAgent.parse(await req.json());
  const [agent] = await db.select().from(agents).where(and(eq(agents.id, id), eq(agents.userId, currentUserId())));
  if (!agent) return Response.json({ error: 'Not found' }, { status: 404 });

  const [updated] = await db
    .update(agents)
    .set({
      ...(patch.status && { status: patch.status }),
      ...(patch.policy && { policy: patch.policy, mandateText: patch.mandateText ?? agent.mandateText, policyVersion: agent.policyVersion + 1 }),
    })
    .where(eq(agents.id, id))
    .returning();

  if (patch.status && patch.status !== agent.status) {
    await record({
      userId: agent.userId,
      agentId: id,
      type: `agent.${patch.status}`,
      message: patch.status === 'frozen' ? `${agent.name} frozen. It can't spend until you unfreeze it.` : `${agent.name} unfrozen.`,
    });
  }
  if (patch.policy) {
    await record({ userId: agent.userId, agentId: id, type: 'agent.rules_updated', message: `${agent.name}'s rules updated (v${updated.policyVersion}): ${patch.policy.summary}` });
  }
  return Response.json({ ok: true, policyVersion: updated.policyVersion, status: updated.status });
});
