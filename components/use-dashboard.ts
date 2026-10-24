'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardState } from '@/lib/dashboard';

// Fetches dashboard state and re-fetches whenever the server reports activity over SSE.
export function useDashboard() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(
    () =>
      fetch('/api/state', { cache: 'no-store' })
        .then(async (res) => {
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? res.statusText);
          setState(body);
          setError(null);
        })
        .catch((err: Error) => setError(err.message)),
    [],
  );

  useEffect(() => {
    refresh();
    const es = new EventSource('/api/events');
    es.addEventListener('ready', () => setLive(true));
    es.addEventListener('activity', () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(refresh, 150);
    });
    es.onerror = () => setLive(false);
    return () => {
      es.close();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);

  return { state, error, live, refresh };
}

export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}
