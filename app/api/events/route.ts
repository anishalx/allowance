import { currentUserId } from '@/lib/dashboard';
import { dbReady } from '@/lib/db';
import type { EventRow } from '@/lib/db/schema';
import { bus } from '@/lib/events';

// Server-sent events: the dashboard re-fetches state whenever something happens.
export async function GET(req: Request) {
  await dbReady();
  const userId = currentUserId();
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const onEvent = (e: EventRow) => e.userId === userId && send('activity', e);
      const ping = setInterval(() => send('ping', Date.now()), 20_000);
      bus.on('event', onEvent);
      send('ready', { at: Date.now() });
      cleanup = () => {
        clearInterval(ping);
        bus.off('event', onEvent);
      };
      req.signal.addEventListener('abort', () => {
        cleanup();
        controller.close();
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  });
}
