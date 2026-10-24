import { and, desc, eq, inArray, isNotNull, like, lt, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { generateAgentKey, newId } from './agents/keys';
import { db, dbReady } from './db';
import { agents, events, operations, paymentRequests, users, wallets } from './db/schema';
import { DEMO_USER_ID, SEED_AGENTS } from './db/seed';
import { DEMO_COOKIE, VISITOR_COOKIE, ownerToken, publicDemo } from './demo-token';
import { record } from './events';
import { HttpError } from './http';

// The hosted demo is public, so every browser gets a private household: its own agents, rules,
// history and kill switch. Visitors spend from the owner's linked sandbox wallet, but their kill
// switch only unlinks it for them; it never deletes the real PayPal Vault token. The owner household
// (u_demo) is the real one: it holds that wallet, gets phone pushes and is reached by a private link.
// Locally there is only the owner household.

export const OWNER_HOUSEHOLD = DEMO_USER_ID;
export type HouseholdKind = 'local' | 'owner' | 'visitor';

export const householdKind = (userId: string): HouseholdKind => (!publicDemo() ? 'local' : userId === OWNER_HOUSEHOLD ? 'owner' : 'visitor');

export async function currentUserId(): Promise<string> {
  if (!publicDemo()) return OWNER_HOUSEHOLD;
  const value = (await cookies()).get(DEMO_COOKIE)?.value;
  if (value && value === ownerToken()) return OWNER_HOUSEHOLD;
  if (!value || !VISITOR_COOKIE.test(value)) throw new HttpError(401, 'Open Allowance in a browser to start your private demo.');
  const userId = `u_${value}`;
  await ensureHousehold(userId);
  return userId;
}

const g = globalThis as unknown as { __allowanceHouseholds?: Map<string, Promise<void>>; __allowancePrunedAt?: number };
const seeded = (g.__allowanceHouseholds ??= new Map());

export function ensureHousehold(userId: string) {
  let ready = seeded.get(userId);
  if (!ready) {
    ready = seedHousehold(userId).catch((err) => {
      seeded.delete(userId);
      throw err;
    });
    seeded.set(userId, ready);
  }
  return ready;
}

async function seedHousehold(userId: string) {
  await dbReady();
  const created = await db.insert(users).values({ id: userId, name: 'Your demo household' }).onConflictDoNothing().returning({ id: users.id });
  if (!created.length) return; // already set up (another request won the race, or a returning visitor)
  const suffix = userId.slice(-32);
  for (const a of SEED_AGENTS) {
    const { hash, prefix } = generateAgentKey();
    await db.insert(agents).values({ ...a, id: `${a.id}_${suffix}`, userId, apiKeyHash: hash, apiKeyPrefix: prefix });
  }
  await db.insert(wallets).values({ id: newId('w'), userId, status: 'active' }); // no token of its own: the shared sandbox wallet
  void pruneStaleHouseholds();
}

async function deleteHouseholdData(userId: string) {
  await db.delete(events).where(eq(events.userId, userId));
  await db.delete(operations).where(eq(operations.userId, userId));
  await db.delete(paymentRequests).where(eq(paymentRequests.userId, userId));
  await db.delete(wallets).where(eq(wallets.userId, userId));
  await db.delete(agents).where(eq(agents.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
  seeded.delete(userId);
}

// Visitor households that nobody has opened in three weeks.
async function pruneStaleHouseholds() {
  const now = Date.now();
  if (now - (g.__allowancePrunedAt ?? 0) < 3_600_000) return;
  g.__allowancePrunedAt = now;
  try {
    const stale = await db
      .select({ id: users.id })
      .from(users)
      .where(and(like(users.id, 'u_v_%'), lt(users.createdAt, new Date(now - 21 * 86_400_000))));
    for (const { id } of stale) {
      const [latest] = await db.select({ at: events.createdAt }).from(events).where(eq(events.userId, id)).orderBy(desc(events.id)).limit(1);
      if (!latest || latest.at.getTime() < now - 21 * 86_400_000) await deleteHouseholdData(id);
    }
  } catch (err) {
    console.error('[households] prune failed:', (err as Error).message);
  }
}

// "Start over": a visitor household goes back to exactly how it began. The owner household keeps
// its wallet and agent keys, but history is cleared and the starting agents get their rules back.
export async function resetHousehold(userId: string) {
  if (householdKind(userId) === 'visitor') {
    await deleteHouseholdData(userId);
    await ensureHousehold(userId);
  } else {
    await db.delete(paymentRequests).where(eq(paymentRequests.userId, userId));
    await db.delete(operations).where(eq(operations.userId, userId));
    await db.delete(events).where(eq(events.userId, userId));
    for (const { id, ...rules } of SEED_AGENTS) {
      await db
        .update(agents)
        .set({ kind: 'shopper', opsPolicy: null, ...rules, status: 'active', policyVersion: sql`${agents.policyVersion} + 1` })
        .where(and(eq(agents.id, id), eq(agents.userId, userId)));
    }
    await db.update(agents).set({ status: 'active' }).where(eq(agents.userId, userId));
  }
  await record({ userId, type: 'demo.reset', message: 'Demo reset: history cleared and the starting agents have their original rules.' });
}

// The wallet agents spend from. A visitor's own row has no token; it stands for the shared sandbox wallet.
export async function activeWallet(userId: string) {
  const [w] = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.status, 'active')))
    .orderBy(desc(wallets.createdAt))
    .limit(1);
  if (!w) return null;
  if (w.paymentTokenId || userId === OWNER_HOUSEHOLD) return { ...w, shared: false };
  const [owner] = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.userId, OWNER_HOUSEHOLD), eq(wallets.status, 'active'), isNotNull(wallets.paymentTokenId)))
    .orderBy(desc(wallets.createdAt))
    .limit(1);
  return owner ? { ...w, paymentTokenId: owner.paymentTokenId, customerId: owner.customerId, payerEmail: owner.payerEmail, shared: true } : null;
}

// Dashboard actions (no capability token) may only touch the caller's own household.
export const isMine = (userId: string) => currentUserId().then((me) => me === userId, () => false);

// A visitor "links" by switching the shared sandbox wallet back on; there's no PayPal login to do.
export async function linkSharedWallet(userId: string) {
  await db.update(wallets).set({ status: 'revoked' }).where(and(eq(wallets.userId, userId), inArray(wallets.status, ['active', 'pending'])));
  await db.insert(wallets).values({ id: newId('w'), userId, status: 'active' });
  await record({ userId, type: 'wallet.linked', message: 'Shared sandbox wallet linked. Agents can spend within their rules again.' });
}
