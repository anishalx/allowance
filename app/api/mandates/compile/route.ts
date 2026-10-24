import { z } from 'zod';
import { compileMandate } from '@/lib/ai/compiler';
import { route } from '@/lib/http';

const CompileInput = z.object({
  agentName: z.string().trim().min(1).max(40),
  agentRole: z.string().trim().min(3).max(300),
  text: z.string().trim().min(3).max(2000),
  timezone: z.string().max(64).optional(),
});

export const POST = route(async (req: Request) => {
  const input = CompileInput.parse(await req.json());
  return Response.json(await compileMandate(input));
});
