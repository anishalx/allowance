import { getDashboardState } from '@/lib/dashboard';
import { route } from '@/lib/http';

export const GET = route(async () => Response.json(await getDashboardState()));
