import { createHmac } from 'node:crypto';
import { secret } from './env';

// Shared by proxy.ts and lib/households.ts, so it must not import the database.

export const DEMO_COOKIE = 'alw_demo';
export const VISITOR_COOKIE = /^v_[0-9a-f]{32}$/;

// The hosted demo is public (Render sets RENDER=true), so each browser gets its own household there.
export const publicDemo = () => process.env.RENDER === 'true' || process.env.PUBLIC_DEMO === '1';

// The private owner link (/?owner=<token>) opens the real household. Derived from a secret that's
// already configured so nothing extra needs setting up; OWNER_TOKEN overrides it.
export function ownerToken() {
  const explicit = secret('OWNER_TOKEN');
  if (explicit) return explicit;
  const key = secret('PAYPAL_CLIENT_SECRET');
  return key ? createHmac('sha256', key).update('allowance-owner').digest('base64url').slice(0, 24) : null;
}
