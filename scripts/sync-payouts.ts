import { inArray } from 'drizzle-orm';
import { db, dbReady } from '../lib/db';
import { paymentRequests } from '../lib/db/schema';
import { syncPayout } from '../lib/payments/service';
await dbReady();
for (const r of await db.select().from(paymentRequests).where(inArray(paymentRequests.status, ['paid']))) {
  const s = await syncPayout(r.id, 99);
  console.log(r.id, r.merchant.name, '→', s?.status, s?.payoutStatus, s?.payoutFeeCents ?? '');
}
process.exit(0);
