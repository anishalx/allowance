import { connection } from 'next/server';
import { reconcile } from '@/lib/console-data';
import { route } from '@/lib/http';

const handler = route(async () => Response.json(await reconcile()));

// connection() must sit outside route(): its prerender bail-out is a rejection that route() would swallow.
export async function GET() {
  await connection();
  return handler();
}
