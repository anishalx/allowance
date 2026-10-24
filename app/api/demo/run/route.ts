import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { runDemoAgent, type AgentStep } from '@/lib/agent/demo-agent';
import { currentUserId } from '@/lib/dashboard';
import { db, dbReady } from '@/lib/db';
import { agents } from '@/lib/db/schema';
import { errorResponse } from '@/lib/http';
import { rateLimited } from '@/lib/rate-limit';

const RunInput = z.object({
  agentId: z.string(),
  task: z.string().trim().min(3).max(1000),
  mode: z.enum(['normal', 'compromised']).default('normal'),
});

// Streams the demo agent's steps as server-sent events.
export async function POST(req: Request) {
  const limited = rateLimited(req, 'demo-run', 4);
  if (limited) return limited;
  try {
    await dbReady();
    const input = RunInput.parse(await req.json());
    const [agent] = await db.select().from(agents).where(and(eq(agents.id, input.agentId), eq(agents.userId, currentUserId())));
    if (!agent) return Response.json({ error: 'Agent not found' }, { status: 404 });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (step: AgentStep) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...step, at: Date.now() })}\n\n`));
          } catch {
            // client went away
          }
        };
        await runDemoAgent({ agent, task: input.task, mode: input.mode, onStep: send, signal: req.signal });
        controller.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' } });
  } catch (err) {
    return errorResponse(err);
  }
}
