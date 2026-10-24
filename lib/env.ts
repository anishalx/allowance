// Secrets pasted into hosting dashboards often pick up stray whitespace, newlines or quotes,
// which surface as confusing 401s. Read them through this.
export function secret(name: string) {
  const raw = process.env[name];
  if (!raw) return undefined;
  return raw.trim().replace(/^(['"])(.*)\1$/, '$2').trim();
}
