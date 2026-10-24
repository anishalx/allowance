import { eq } from 'drizzle-orm';
import { db, dbReady } from '../db';
import { agents } from '../db/schema';
import { keyMatches } from './keys';

export async function authenticateAgent(key: string | null | undefined) {
  if (!key?.startsWith('alw_')) return null;
  await dbReady();
  const candidates = await db.select().from(agents).where(eq(agents.apiKeyPrefix, key.slice(0, 12)));
  return candidates.find((a) => keyMatches(key, a.apiKeyHash)) ?? null;
}

export function bearerKey(req: Request) {
  const header = req.headers.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  // Fallback for MCP clients that can't set headers.
  return new URL(req.url).searchParams.get('key');
}
