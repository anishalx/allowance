import { and, eq } from 'drizzle-orm';
import { generateAgentKey } from '@/lib/agents/keys';
import { currentUserId } from '@/lib/dashboard';
import { db, dbReady } from '@/lib/db';
import { agents } from '@/lib/db/schema';
import { record } from '@/lib/events';
import { route } from '@/lib/http';

// Issue a new key (shown once); the old key stops working immediately.
export const POST = route(async (_req: Request, ctx: RouteContext<'/api/agents/[id]/key'>) => {
  await dbReady();
  const { id } = await ctx.params;
  const { key, hash, prefix } = generateAgentKey();
  const [agent] = await db
    .update(agents)
    .set({ apiKeyHash: hash, apiKeyPrefix: prefix })
    .where(and(eq(agents.id, id), eq(agents.userId, await currentUserId())))
    .returning();
  if (!agent) return Response.json({ error: 'Not found' }, { status: 404 });
  await record({ userId: agent.userId, agentId: id, type: 'agent.key_rotated', message: `New API key issued for ${agent.name}; the old one no longer works.` });
  return Response.json({ apiKey: key });
});
