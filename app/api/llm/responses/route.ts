import { secret } from '@/lib/env';
import { rateLimited } from '@/lib/rate-limit';

// Same-origin proxy for the AG Studio console's assistant, so the OpenAI key never reaches the browser.
const ALLOWED_MODELS = new Set(['gpt-5.5', 'gpt-5.4-mini']);

export async function POST(req: Request) {
  const limited = rateLimited(req, 'llm', 40);
  if (limited) return limited;
  if (req.headers.get('sec-fetch-site') && req.headers.get('sec-fetch-site') !== 'same-origin') {
    return Response.json({ error: { message: 'Not allowed' } }, { status: 403 });
  }
  const body = await req.json();
  if (!ALLOWED_MODELS.has(body.model)) body.model = 'gpt-5.4-mini';

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
