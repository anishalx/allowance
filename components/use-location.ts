'use client';

import { useSyncExternalStore } from 'react';

// Values from the browser's address bar, read during render instead of copied into state by an effect.
// The server render (and the first hydration pass) sees the fallback, or null for a search param.
const noUpdates = () => () => {};

export const useOrigin = (fallback: string) => useSyncExternalStore(noUpdates, () => window.location.origin, () => fallback);

export const useSearchParam = (name: string, ifAbsent: string | null = null) =>
  useSyncExternalStore(noUpdates, () => new URLSearchParams(window.location.search).get(name) ?? ifAbsent, () => null);
