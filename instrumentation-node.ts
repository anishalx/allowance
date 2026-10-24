import net from 'node:net';

// Node races IPv4/IPv6 with a 250 ms per-attempt budget; on slower links that aborts healthy IPv4
// connections (ETIMEDOUT) when IPv6 isn't routable. Give each attempt a realistic window instead.
net.setDefaultAutoSelectFamilyAttemptTimeout(2_500);
