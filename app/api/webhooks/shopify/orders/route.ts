import {createHmac, timingSafeEqual} from 'node:crypto';

/**
 * Shopify `orders/create` → Mixpanel.
 *
 * Exists because the storefront cannot see a purchase. Shopify's checkout runs
 * on its own domain where our JavaScript never executes, so a funnel built from
 * storefront events ends at `Checkout - Started` and never records whether the
 * order actually completed. Without this, Mixpanel can show where buyers drop
 * off before checkout but not conversion rate or revenue — and "which companies
 * order online rather than by phone" is the question Phase Zero has to answer.
 *
 * Lives here rather than in the storefront for two reasons. Oxygen's access
 * protection redirects every inbound request to `accounts.shopify.com`, and
 * Shopify's webhook sender has no login — the same wall PunchOut hit. And a
 * server-side event survives the ad-blockers that drop a share of browser
 * events, which matters most for the one event you cannot afford to miss.
 *
 * **This route authenticates itself, and must.** The shared `x-api-key` that
 * guards every other endpoint here cannot apply: Shopify doesn't send it.
 * `middleware.ts` therefore skips this path, and the HMAC check below is the
 * only thing standing between the internet and forged revenue in your
 * analytics. It is not optional and it must run before anything else.
 */

const MIXPANEL_TRACK_URL = 'https://api.mixpanel.com/track';

/** Mirrors `EventName.OrderPlaced` in the storefront's `app/lib/analytics`. */
const ORDER_PLACED_EVENT = 'Order - Placed';

/**
 * Verifies Shopify's signature over the **raw** body.
 *
 * The signature covers the exact bytes sent, so the body must be read as text
 * and hashed before any JSON parsing — re-serialising a parsed object changes
 * whitespace and key order and the digest will never match.
 */
function isFromShopify(rawBody: string, header: string | null): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  if (!secret || !header) return false;

  const expected = createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  const a = Buffer.from(expected);
  const b = Buffer.from(header);

  // `timingSafeEqual` throws on length mismatch, which is itself a signal — so
  // check length first rather than letting it throw.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

type ShopifyOrderWebhook = {
  id?: number | string;
  admin_graphql_api_id?: string;
  order_number?: number;
  email?: string | null;
  contact_email?: string | null;
  currency?: string;
  total_price?: string;
  created_at?: string;
  customer?: {email?: string | null} | null;
  line_items?: unknown[];
  company?: {id?: number | string; location_id?: number | string} | null;
};

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!isFromShopify(rawBody, request.headers.get('x-shopify-hmac-sha256'))) {
    // Deliberately terse: a forged request learns nothing about why it failed.
    return Response.json({error: 'Unauthorized'}, {status: 401});
  }

  const token = process.env.MIXPANEL_TOKEN;

  if (!token) {
    // 200, not 500. Shopify retries failures for days and then disables the
    // subscription; a missing token is our misconfiguration, not a delivery
    // problem, and retrying it will not help.
    console.warn('MIXPANEL_TOKEN is not set — dropping order webhook.');
    return Response.json({ok: true, forwarded: false});
  }

  let order: ShopifyOrderWebhook;
  try {
    order = JSON.parse(rawBody) as ShopifyOrderWebhook;
  } catch {
    return Response.json({error: 'Malformed body'}, {status: 400});
  }

  /**
   * `distinct_id` **must** match what the browser sends, or this event lands as
   * an orphan and joins to nothing — losing the whole point, which is tying a
   * purchase back to the session that produced it. The storefront identifies
   * buyers by email (`app/lib/analytics` → `Tracker.identify`), so this does
   * too.
   *
   * `email` is null on orders placed without one; `contact_email` and the
   * customer record are the fallbacks.
   */
  const distinctId =
    order.email ?? order.contact_email ?? order.customer?.email ?? null;

  if (!distinctId) {
    // Better to drop it than to create a profile keyed on something arbitrary
    // that will never match a real buyer.
    console.warn(`Order ${order.id} has no email — not forwarded.`);
    return Response.json({ok: true, forwarded: false});
  }

  const orderId = order.admin_graphql_api_id ?? String(order.id ?? '');

  /**
   * Mixpanel requires `$insert_id` to be **at most 36 bytes and only
   * alphanumeric or `-`**, so the GID cannot be used: `://` is rejected, and
   * `order-gid://shopify/Order/5544332211` is already exactly 36 bytes — a
   * longer order id would overflow it. An invalid or truncated insert id stops
   * deduplicating, and then Shopify's retries each count as another sale.
   *
   * The numeric id satisfies both rules. Digits are recovered from the GID when
   * only that is present.
   */
  const numericOrderId =
    String(order.id ?? '').replace(/\D/g, '') ||
    orderId.replace(/\D/g, '') ||
    'unknown';

  const payload = [
    {
      event: ORDER_PLACED_EVENT,
      properties: {
        token,
        distinct_id: distinctId,
        /**
         * Shopify retries a webhook it thinks failed, and a retry is a second
         * identical delivery. Keying the insert id to the order collapses them
         * into one event — without it, one order becomes three purchases and
         * the conversion numbers are wrong in the flattering direction.
         */
        $insert_id: `order-${numericOrderId}`,
        // Shopify's timestamp, not ours: a retry hours later should still be
        // recorded when the order happened. `/track` rejects anything older
        // than 5 days, which matters if a backlog is ever replayed.
        time: Math.floor(
          new Date(order.created_at ?? Date.now()).getTime() / 1000,
        ),
        orderId,
        orderNumber: order.order_number,
        total: order.total_price ? Number(order.total_price) : undefined,
        currency: order.currency,
        itemCount: order.line_items?.length,
        // Present only on B2B orders. This is what makes "which companies buy
        // online" answerable from the purchase event itself rather than by
        // joining back to a session's super properties.
        companyId: order.company?.id ? String(order.company.id) : undefined,
        companyLocationId: order.company?.location_id
          ? String(order.company.location_id)
          : undefined,
        isB2B: Boolean(order.company),
      },
    },
  ];

  try {
    const response = await fetch(MIXPANEL_TRACK_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn(
        `Mixpanel rejected order ${orderId}: ${response.status} ${await response.text()}`,
      );
    }
  } catch (error) {
    // Still 200 below. Shopify's retry exists to recover from *delivery*
    // failures, and replaying the webhook won't fix Mixpanel being down — it
    // would just re-run the HMAC check and fail the same way, eventually
    // disabling the subscription.
    console.warn(`Failed to forward order ${orderId} to Mixpanel.`, error);
  }

  // Shopify expects a 2xx within 5 seconds or it treats the delivery as failed.
  return Response.json({ok: true});
}
