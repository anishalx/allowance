import { spendAi } from '@/lib/ai/budget';
import { secret } from '@/lib/env';
import { currentUserId } from '@/lib/households';
import { rateLimited } from '@/lib/rate-limit';

// Same-origin proxy for the AG Studio console's assistant, so the OpenAI key never reaches the browser.
// Only the console page may use it: it needs the page's demo household and counts against its AI cap.
const ALLOWED_MODELS = new Set(['gpt-5.5', 'gpt-5.4-mini']);
const MAX_OUTPUT_TOKENS = 8_000;

const refuse = (status: number, message: string) => Response.json({ error: { message } }, { status });

export async function POST(req: Request) {
  const limited = rateLimited(req, 'llm', 40);
  if (limited) return limited;
  if (req.headers.get('sec-fetch-site') !== 'same-origin') return refuse(403, 'Not allowed');
  const household = await currentUserId().catch(() => null);
  if (!household) return refuse(401, 'Open the console in a browser first.');
  const overBudget = spendAi(household, 'console');
  if (overBudget) return refuse(429, overBudget);

  const body = await req.json();
  if (!ALLOWED_MODELS.has(body.model)) body.model = 'gpt-5.4-mini';
  body.max_output_tokens = Math.min(Number(body.max_output_tokens) || MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS);

  const upstream = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret('OPENAI_API_KEY')}` },
    body: JSON.stringify(body),
    signal: req.signal,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' },
  });
}
