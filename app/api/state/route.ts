import { connection } from 'next/server';
import { getDashboardState } from '@/lib/dashboard';
import { route } from '@/lib/http';

const handler = route(async () => Response.json(await getDashboardState()));

// connection() must sit outside route(): its prerender bail-out is a rejection that route() would swallow.
export async function GET() {
  await connection();
  return handler();
}
