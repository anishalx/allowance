import { newId } from '@/lib/agents/keys';
import { currentUserId } from '@/lib/dashboard';
import { db, dbReady } from '@/lib/db';
import { wallets } from '@/lib/db/schema';
import { route } from '@/lib/http';
import { appUrl } from '@/lib/notify';
import { createVaultSetupToken } from '@/lib/paypal/api';

// Step 1 of linking: PayPal Vault v3 setup token → the human approves on PayPal → /vault/return.
export const POST = route(async () => {
  await dbReady();
  const { setupTokenId, approveUrl } = await createVaultSetupToken({
    returnUrl: `${appUrl()}/vault/return`,
    cancelUrl: `${appUrl()}/vault/cancel`,
  });
  await db.insert(wallets).values({ id: newId('w'), userId: currentUserId(), status: 'pending', setupTokenId });
  return Response.json({ approveUrl });
});
