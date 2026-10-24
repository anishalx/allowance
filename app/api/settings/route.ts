import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { currentUserId } from '@/lib/dashboard';
import { db, dbReady } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { route } from '@/lib/http';

const Settings = z.object({
  ntfyTopic: z
    .string()
    .trim()
    .regex(/^[\w-]{6,64}$/, 'Use 6–64 letters, numbers, dashes or underscores')
    .nullable(),
});

export const PATCH = route(async (req: Request) => {
  await dbReady();
  const { ntfyTopic } = Settings.parse(await req.json());
  await db.update(users).set({ ntfyTopic }).where(eq(users.id, currentUserId()));
  return Response.json({ ok: true });
});
