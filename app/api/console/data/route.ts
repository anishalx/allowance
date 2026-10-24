import { getConsoleData } from '@/lib/console-data';
import { route } from '@/lib/http';

export const GET = route(async () => Response.json(await getConsoleData()));
