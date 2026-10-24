import { z } from 'zod';
import { generateAgentKey, newId } from '@/lib/agents/keys';
import { currentUserId } from '@/lib/dashboard';
import { db, dbReady } from '@/lib/db';
import { agents } from '@/lib/db/schema';
import { record } from '@/lib/events';
import { route } from '@/lib/http';
import { Policy } from '@/lib/policy/schema';

const CreateAgent = z.object({
  name: z.string().trim().min(1).max(40),
  role: z.string().trim().min(3).max(300),
  mandateText: z.string().trim().min(3).max(2000),
  policy: Policy,
});

export const POST = route(async (req: Request) => {
  await dbReady();
  const input = CreateAgent.parse(await req.json());
  const { key, hash, prefix } = generateAgentKey();
  const [agent] = await db
    .insert(agents)
    .values({ id: newId('a'), userId: currentUserId(), ...input, apiKeyHash: hash, apiKeyPrefix: prefix })
    .returning();
  await record({ userId: agent.userId, agentId: agent.id, type: 'agent.created', message: `Created ${agent.name}: ${input.policy.summary}` });
  return Response.json({ id: agent.id, apiKey: key });
});
