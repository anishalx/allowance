import { z } from 'zod';
import { generateAgentKey, newId } from '@/lib/agents/keys';
import { currentUserId } from '@/lib/dashboard';
import { db, dbReady } from '@/lib/db';
import { agents } from '@/lib/db/schema';
import { record } from '@/lib/events';
import { route } from '@/lib/http';
import { noPurchasesPolicy } from '@/lib/db/seed';
import { OpsPolicy } from '@/lib/ops/schema';
import { Policy } from '@/lib/policy/schema';

const CreateAgent = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('shopper').default('shopper'), name: z.string().trim().min(1).max(40), role: z.string().trim().min(3).max(300), mandateText: z.string().trim().min(3).max(2000), policy: Policy }),
  z.object({ kind: z.literal('business'), name: z.string().trim().min(1).max(40), role: z.string().trim().min(3).max(300), mandateText: z.string().trim().min(3).max(2000), opsPolicy: OpsPolicy }),
]);

export const POST = route(async (req: Request) => {
  await dbReady();
  const body = await req.json();
  const input = CreateAgent.parse({ kind: 'shopper', ...body });
  const { key, hash, prefix } = generateAgentKey();
  const rules =
    input.kind === 'business'
      ? { kind: 'business' as const, policy: noPurchasesPolicy, opsPolicy: input.opsPolicy } // business agents operate PayPal; they can't spend
      : { kind: 'shopper' as const, policy: input.policy };
  const [agent] = await db
    .insert(agents)
    .values({ id: newId('a'), userId: currentUserId(), name: input.name, role: input.role, mandateText: input.mandateText, ...rules, apiKeyHash: hash, apiKeyPrefix: prefix })
    .returning();
  const summary = input.kind === 'business' ? input.opsPolicy.summary : input.policy.summary;
  await record({ userId: agent.userId, agentId: agent.id, type: 'agent.created', message: `Created ${agent.name}: ${summary}` });
  return Response.json({ id: agent.id, apiKey: key });
});
