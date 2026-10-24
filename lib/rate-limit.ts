// Small in-memory token bucket per client IP and route. Enough to keep a public demo from burning
// OpenAI credits; a multi-instance deployment would move this to a shared store.
type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';

export function rateLimited(req: Request, name: string, perMinute: number): Response | null {
  const key = `${name}:${clientIp(req)}`;
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: perMinute, updated: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.updated) / 60_000) * perMinute);
  b.updated = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return Response.json({ error: 'Too many requests. Give it a minute and try again.' }, { status: 429, headers: { 'Retry-After': '30' } });
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 5_000) for (const [k, v] of buckets) if (now - v.updated > 300_000) buckets.delete(k);
  return null;
}
