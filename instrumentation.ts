export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Node races IPv4/IPv6 with a 250 ms per-attempt budget; on slower links that aborts healthy IPv4
  // connections (ETIMEDOUT) when IPv6 isn't routable. Give each attempt a realistic window instead.
  const net = await import('node:net');
  net.setDefaultAutoSelectFamilyAttemptTimeout(2_500);
}
