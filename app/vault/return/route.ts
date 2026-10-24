import { and, eq, ne } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { wallets } from '@/lib/db/schema';
import { record } from '@/lib/events';
import { appUrl } from '@/lib/notify';
import { createVaultPaymentToken } from '@/lib/paypal/api';

// Step 2 of linking: PayPal redirects here after the human approves. Exchange the setup token for a payment token.
export async function GET(req: Request) {
  await dbReady();
  const setupTokenId = new URL(req.url).searchParams.get('approval_token_id');
  const [pending] = setupTokenId
    ? await db.select().from(wallets).where(and(eq(wallets.setupTokenId, setupTokenId), eq(wallets.status, 'pending')))
    : [];
  if (!pending) return NextResponse.redirect(`${appUrl()}/dashboard?link=missing`);

  try {
    const token = await createVaultPaymentToken(pending.setupTokenId!);
    await db.update(wallets).set({ status: 'revoked' }).where(and(eq(wallets.userId, pending.userId), eq(wallets.status, 'active'), ne(wallets.id, pending.id)));
    await db
      .update(wallets)
      .set({ status: 'active', paymentTokenId: token.paymentTokenId, customerId: token.customerId, payerEmail: token.payerEmail })
      .where(eq(wallets.id, pending.id));
    await record({
      userId: pending.userId,
      type: 'wallet.linked',
      message: `PayPal wallet ${token.payerEmail ?? ''} linked. Agents can now spend within their rules.`,
      data: { customerId: token.customerId },
    });
    return NextResponse.redirect(`${appUrl()}/dashboard?link=ok`);
  } catch (err) {
    console.error('[vault] payment token failed', err);
    return NextResponse.redirect(`${appUrl()}/dashboard?link=failed`);
  }
}
