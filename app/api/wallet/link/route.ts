import { newId } from '@/lib/agents/keys';
import { currentUserId } from '@/lib/dashboard';
import { db, dbReady } from '@/lib/db';
import { wallets } from '@/lib/db/schema';
import { householdKind, linkSharedWallet } from '@/lib/households';
import { route } from '@/lib/http';
import { rateLimited } from '@/lib/rate-limit';
import { appUrl } from '@/lib/notify';
import { createVaultSetupToken } from '@/lib/paypal/api';

// Step 1 of linking: PayPal Vault v3 setup token → the human approves on PayPal → /vault/return.
export const POST = route(async (req: Request) => {
  const limited = rateLimited(req, 'wallet-link', 5);
  if (limited) return limited;
  await dbReady();
  const userId = await currentUserId();
  if (householdKind(userId) === 'visitor') {
    await linkSharedWallet(userId);
    return Response.json({ linked: true });
  }
  const { setupTokenId, approveUrl } = await createVaultSetupToken({
    returnUrl: `${appUrl()}/vault/return`,
    cancelUrl: `${appUrl()}/vault/cancel`,
  });
  await db.insert(wallets).values({ id: newId('w'), userId, status: 'pending', setupTokenId });
  return Response.json({ approveUrl });
});
