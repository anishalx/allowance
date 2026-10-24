import { eq } from 'drizzle-orm';
import { currentUserId } from '@/lib/dashboard';
import { db, dbReady } from '@/lib/db';
import { agents, events, paymentRequests } from '@/lib/db/schema';
import { record } from '@/lib/events';
import { route } from '@/lib/http';

// Clears purchase history and activity (budgets start fresh); keeps the linked wallet and agents.
// Sandbox money that already moved stays moved in PayPal; this only resets Allowance's view.
export const POST = route(async () => {
  await dbReady();
  const userId = currentUserId();
  await db.delete(paymentRequests).where(eq(paymentRequests.userId, userId));
  await db.delete(events).where(eq(events.userId, userId));
  await db.update(agents).set({ status: 'active' }).where(eq(agents.userId, userId));
  await record({ userId, type: 'demo.reset', message: 'Demo data reset: budgets start fresh.' });
  return Response.json({ ok: true });
});
