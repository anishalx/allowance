import { NextResponse, type NextRequest } from 'next/server';
import { DEMO_COOKIE, VISITOR_COOKIE, ownerToken, publicDemo } from './lib/demo-token';

const setDemoCookie = (res: NextResponse, value: string) =>
  res.cookies.set({ name: DEMO_COOKIE, value, httpOnly: true, sameSite: 'lax', secure: process.env.RENDER === 'true', path: '/', maxAge: 60 * 86_400 });

// Gives every browser on the public demo its own private household (see lib/households.ts).
// ?owner=<token> switches this browser to the owner household; ?owner=off goes back to a visitor one.
export function proxy(request: NextRequest) {
  if (!publicDemo()) return NextResponse.next();
  const owner = ownerToken();

  const asked = request.nextUrl.searchParams.get('owner');
  if (asked !== null) {
    const url = request.nextUrl.clone();
    url.searchParams.delete('owner');
    const res = NextResponse.redirect(url);
    if (owner && asked === owner) setDemoCookie(res, owner);
    else res.cookies.delete(DEMO_COOKIE);
    return res;
  }

  const current = request.cookies.get(DEMO_COOKIE)?.value;
  if (current && (current === owner || VISITOR_COOKIE.test(current))) return NextResponse.next();

  const visitor = `v_${crypto.randomUUID().replaceAll('-', '')}`;
  request.cookies.set(DEMO_COOKIE, visitor); // so this very request already renders as the new household
  const res = NextResponse.next({ request: { headers: request.headers } });
  setDemoCookie(res, visitor);
  return res;
}

export const config = {
  // App pages only. API calls, MCP clients, webhooks and agents reading the /mall stores never get a
  // household assigned here; a store page fetched without a cookie shows the owner's store.
  matcher: ['/((?!api|mall|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
