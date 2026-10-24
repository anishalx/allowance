import { randomUUID } from 'node:crypto';
import { secret } from '../env';

const BASE_URL = secret('PAYPAL_BASE_URL') ?? 'https://api-m.sandbox.paypal.com';
const MAX_ATTEMPTS = 4;

export class PayPalError extends Error {
  constructor(
    readonly status: number,
    readonly issue: string,
    readonly debugId: string | undefined,
    readonly body: unknown,
  ) {
    super(`PayPal ${status} ${issue}${debugId ? ` (debug_id ${debugId})` : ''}`);
  }
}

type CachedToken = { value: string; expiresAt: number };
let token: CachedToken | null = null;
let inflight: Promise<CachedToken> | null = null;

async function fetchToken(): Promise<CachedToken> {
  const id = secret('PAYPAL_CLIENT_ID');
  const clientSecret = secret('PAYPAL_CLIENT_SECRET');
  if (!id || !clientSecret) throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set');
  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const body = await res.json();
  if (!res.ok) throw new PayPalError(res.status, body.error ?? 'OAUTH_FAILED', undefined, body);
  // Refresh five minutes early; lifetime varies by scope, so trust expires_in rather than a constant.
  return { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 300) * 1000 };
}

export async function accessToken(forceRefresh = false) {
  if (!forceRefresh && token && token.expiresAt > Date.now()) return token.value;
  inflight ??= fetchToken().finally(() => (inflight = null));
  token = await inflight;
  return token.value;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type RequestOptions = {
  body?: unknown;
  rawBody?: string; // pre-serialized JSON, sent byte-for-byte

  // Reused verbatim across retries so PayPal deduplicates instead of charging twice.
  idempotencyKey?: string;
  headers?: Record<string, string>;
};

export async function paypal<T = any>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, opts: RequestOptions = {}): Promise<T> {
  const requestId = method === 'POST' ? (opts.idempotencyKey ?? randomUUID()) : undefined;
  let refreshed = false;

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(requestId && { 'PayPal-Request-Id': requestId }),
        ...opts.headers,
      },
      body: opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
    });

    if (res.status === 401 && !refreshed) {
      refreshed = true;
      await accessToken(true);
      continue;
    }

    const text = await res.text();
    const body = text ? JSON.parse(text) : {};
    if (res.ok) return body as T;

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 250);
      continue;
    }

    const issue = body.details?.[0]?.issue ?? body.name ?? body.error ?? 'UNKNOWN_ERROR';
    console.error(`[paypal] ${method} ${path} → ${res.status} ${issue} debug_id=${body.debug_id}`);
    throw new PayPalError(res.status, issue, body.debug_id, body);
  }
}

export const centsToValue = (cents: number) => (cents / 100).toFixed(2);
