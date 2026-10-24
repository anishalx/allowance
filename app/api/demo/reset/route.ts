import { currentUserId } from '@/lib/dashboard';
import { dbReady } from '@/lib/db';
import { resetHousehold } from '@/lib/households';
import { route } from '@/lib/http';

// Start the demo over. Sandbox money that already moved stays moved in PayPal; this resets Allowance's view.
export const POST = route(async () => {
  await dbReady();
  await resetHousehold(await currentUserId());
  return Response.json({ ok: true });
});
