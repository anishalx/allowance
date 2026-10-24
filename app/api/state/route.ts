import { connection } from 'next/server';
import { getDashboardState } from '@/lib/dashboard';
import { route } from '@/lib/http';

export const GET = route(async () => {
  await connection();
  return Response.json(await getDashboardState());
});
