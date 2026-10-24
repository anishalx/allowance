import { and, eq } from 'drizzle-orm';
import { currentUserId } from '@/lib/dashboard';
import { db, dbReady } from '@/lib/db';
import { wallets } from '@/lib/db/schema';
import { record } from '@/lib/events';
import { route } from '@/lib/http';
import { deleteVaultPaymentToken } from '@/lib/paypal/api';

// Kill switch: delete the vaulted PayPal token. No agent can spend a cent after this.
export const DELETE = route(async () => {
  await dbReady();
  const userId = currentUserId();
  const active = await db.select().from(wallets).where(and(eq(wallets.userId, userId), eq(wallets.status, 'active')));
  for (const w of active) {
    if (w.paymentTokenId) await deleteVaultPaymentToken(w.paymentTokenId).catch((err) => console.error('[wallet] delete token:', err.message));
    await db.update(wallets).set({ status: 'revoked' }).where(eq(wallets.id, w.id));
  }
  await record({ userId, type: 'wallet.revoked', message: 'PayPal wallet unlinked. Every agent is now unable to spend.' });
  return Response.json({ ok: true });
});
