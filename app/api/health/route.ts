import { connection } from 'next/server';

// Liveness probe for Render and the keep-awake ping. No database or PayPal calls.
export async function GET() {
  await connection();
  return Response.json({ ok: true, at: new Date().toISOString() });
}
