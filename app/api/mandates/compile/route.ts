import { z } from 'zod';
import { compileMandate, compileOpsMandate } from '@/lib/ai/compiler';
import { route } from '@/lib/http';
import { rateLimited } from '@/lib/rate-limit';

const CompileInput = z.object({
  agentName: z.string().trim().min(1).max(40),
  agentRole: z.string().trim().min(3).max(300),
  text: z.string().trim().min(3).max(2000),
  timezone: z.string().max(64).optional(),
  kind: z.enum(['shopper', 'business']).default('shopper'),
});

export const POST = route(async (req: Request) => {
  const limited = rateLimited(req, 'compile', 10);
  if (limited) return limited;
  const input = CompileInput.parse(await req.json());
  return Response.json(input.kind === 'business' ? await compileOpsMandate(input) : await compileMandate(input));
});
