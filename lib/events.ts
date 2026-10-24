import { EventEmitter } from 'node:events';
import { db } from './db';
import { events, type EventRow } from './db/schema';

// Activity log + in-process pub/sub for the live dashboard (SSE) and for agents waiting on approvals.
const g = globalThis as unknown as { __allowanceBus?: EventEmitter };
export const bus = (g.__allowanceBus ??= new EventEmitter().setMaxListeners(200));

export type EventInput = {
  userId: string;
  agentId?: string | null;
  requestId?: string | null;
  type: string;
  message: string;
  data?: Record<string, unknown>;
};

export async function record(e: EventInput): Promise<EventRow> {
  const [row] = await db.insert(events).values(e).returning();
  bus.emit('event', row);
  return row;
}
