import { and, eq } from 'drizzle-orm';
import { currentUserId } from '@/lib/dashboard';
import { db, dbReady } from '@/lib/db';
import { wallets } from '@/lib/db/schema';
import { record } from '@/lib/events';
import { householdKind } from '@/lib/households';
import { route } from '@/lib/http';
import { deleteVaultPaymentToken } from '@/lib/paypal/api';

// Kill switch: delete the vaulted PayPal token. No agent can spend a cent after this.
// A public-demo visitor's wallet row has no token of its own, so for them this only unlinks it.
export const DELETE = route(async () => {
  await dbReady();
  const userId = await currentUserId();
  const active = await db.select().from(wallets).where(and(eq(wallets.userId, userId), eq(wallets.status, 'active')));
  for (const w of active) {
    if (w.paymentTokenId) await deleteVaultPaymentToken(w.paymentTokenId).catch((err) => console.error('[wallet] delete token:', err.message));
    await db.update(wallets).set({ status: 'revoked' }).where(eq(wallets.id, w.id));
  }
  const message =
    householdKind(userId) === 'visitor'
      ? 'Wallet unlinked. Every agent is now unable to spend. (On your own account this also deletes the PayPal Vault token; the public demo keeps its shared sandbox wallet.)'
      : 'PayPal wallet unlinked and its Vault token deleted. Every agent is now unable to spend.';
  await record({ userId, type: 'wallet.revoked', message });
  return Response.json({ ok: true });
});
