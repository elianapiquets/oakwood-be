import {NextResponse, type NextRequest} from 'next/server';

/**
 * Paths that authenticate themselves and must not be gated on `x-api-key`.
 *
 * The webhook receivers are called by Shopify, which sends
 * `X-Shopify-Hmac-Sha256` and knows nothing about our shared key — so gating
 * them here would 401 every delivery, silently, until Shopify gave up and
 * disabled the subscription.
 *
 * !! **Anything added here is exposed to the internet unauthenticated unless
 * the route itself verifies the caller.** The order webhook verifies Shopify's
 * HMAC over the raw body before doing anything else. A new entry without an
 * equivalent check is an open endpoint.
 */
const SELF_AUTHENTICATING_PATHS = ['/api/webhooks/'];

export function middleware(request: NextRequest) {
  if (
    SELF_AUTHENTICATING_PATHS.some((path) =>
      request.nextUrl.pathname.startsWith(path),
    )
  ) {
    return NextResponse.next();
  }

  const key = request.headers.get('x-api-key');
  if (!process.env.BACKEND_API_KEY || key !== process.env.BACKEND_API_KEY) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
