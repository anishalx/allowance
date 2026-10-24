import { connection } from 'next/server';
import { getConsoleData } from '@/lib/console-data';
import { route } from '@/lib/http';

export const GET = route(async () => {
  await connection();
  return Response.json(await getConsoleData());
});
