import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from './schema';
import { seed } from './seed';

function create() {
  const client = createClient({
    url: process.env.DATABASE_URL || 'file:allowance.db',
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof create>;

// Survive Next.js dev hot reloads without opening a new connection each time.
const g = globalThis as unknown as { __allowanceDb?: Db; __allowanceReady?: Promise<void> };
export const db = (g.__allowanceDb ??= create());

// Migrate and seed lazily on first use so `npm run dev` works with zero database setup.
export function dbReady() {
  g.__allowanceReady ??= (async () => {
    await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });
    await seed(db);
  })().catch((err) => {
    g.__allowanceReady = undefined;
    throw err;
  });
  return g.__allowanceReady;
}

export { schema };
