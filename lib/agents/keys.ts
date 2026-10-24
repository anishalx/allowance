import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Agent API keys: shown once, stored only as a SHA-256 hash.
export function generateAgentKey() {
  const key = `alw_${randomBytes(24).toString('base64url')}`;
  return { key, hash: hashKey(key), prefix: key.slice(0, 12) };
}

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

export function keyMatches(key: string, hash: string) {
  const a = Buffer.from(hashKey(key), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString('base64url')}`;
