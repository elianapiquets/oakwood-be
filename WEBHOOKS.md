# Webhooks

Inbound Shopify webhooks. Currently one: `orders/create` → Mixpanel.

## Why they live here

Two reasons, both structural rather than preference.

**The storefront can't receive them.** Oxygen's access protection redirects every inbound
request to `accounts.shopify.com`, and Shopify's webhook sender has no Shopify login — the same
wall PunchOut hit. A route in the Hydrogen app would 401 every delivery.

**The storefront can't see a purchase at all.** Shopify's checkout runs on its own domain where
our JavaScript never executes, so storefront analytics ends at `Checkout - Started` and never
learns whether the order completed. A server-side event also survives the ad-blockers that drop
a share of browser events — which matters most for the one event you can least afford to lose.

## `POST /api/webhooks/shopify/orders`

Forwards `orders/create` to Mixpanel as **`Order - Placed`**, so conversion and revenue can be
analysed against the storefront funnel.

### It authenticates itself, unlike every other route here

`middleware.ts` gates `/api/*` on the shared `x-api-key`. Shopify doesn't send it, so the
middleware **skips `/api/webhooks/`** — see `SELF_AUTHENTICATING_PATHS`. The HMAC check in the
route is therefore the only thing between the internet and forged revenue in your analytics.

The signature is computed over the **raw request body**, before any JSON parsing: re-serialising
a parsed object changes whitespace and key order, and the digest would never match. Comparison
is timing-safe.

Adding another path to `SELF_AUTHENTICATING_PATHS` without an equivalent check creates an open,
unauthenticated endpoint.

### Two details that decide whether the data is usable

**`distinct_id` is the buyer's email**, matching what the storefront sends
(`app/lib/analytics` → `Tracker.identify` in `Oakwood-Frontend`). If these ever diverge, order
events land as orphans and join to nothing — losing the entire point, which is tying a purchase
back to the session that produced it. An order with no email anywhere is dropped rather than
attributed to something arbitrary.

**`$insert_id` is `order-<numeric id>`.** Shopify retries any delivery it thinks failed, and a
retry is a second identical POST; the insert id collapses them into one event. It must be
**≤36 bytes and only alphanumeric or `-`**, which is why the GID can't be used —
`order-gid://shopify/Order/5544332211` contains `://` and is already exactly 36 bytes, so a
longer order id would overflow it. An invalid or truncated insert id silently stops
deduplicating, and then every retry counts as another sale.

`time` comes from the order's `created_at`, not the moment of delivery, so a retry hours later
is still recorded when the order happened. Mixpanel's `/track` rejects events older than 5 days.

### It returns 200 on almost everything

Only a bad signature (401) or unparseable body (400) fail. A missing `MIXPANEL_TOKEN`, a missing
email, or Mixpanel being unreachable all return 200 with a logged warning — deliberately.
Shopify retries failures for days and then **disables the subscription**, and none of those
conditions are delivery problems a retry would fix. Losing the subscription is worse than losing
one event.

## Setup

### 1. Environment

| Variable | Purpose |
|---|---|
| `SHOPIFY_WEBHOOK_SECRET` | Verifies deliveries are really Shopify's. **Without it every delivery is rejected** — the route fails closed |
| `MIXPANEL_TOKEN` | Mixpanel project token. Same value as the storefront's, so events land in one project |

### 2. Register the webhook in Shopify

Shopify admin → **Settings → Notifications → Webhooks → Create webhook**:

- Event: **Order creation**
- Format: **JSON**
- URL: `https://<this-service>/api/webhooks/shopify/orders`

The signing secret is shown on that same page ("your webhooks will be signed with…"). That's
`SHOPIFY_WEBHOOK_SECRET`.

### 3. Verify

Shopify's admin has a **Send test notification** button, which is the real end-to-end check.

To test locally without touching Mixpanel, leave `MIXPANEL_TOKEN` unset — the route then returns
`{"ok":true,"forwarded":false}` and sends nothing, so the HMAC path can be exercised without
putting fake orders in a real project:

```sh
SHOPIFY_WEBHOOK_SECRET=test-secret MIXPANEL_TOKEN= npm run dev
```

```sh
BODY='{"id":123,"email":"buyer@example.com","created_at":"2026-09-02T10:00:00-04:00","total_price":"10.00"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac 'test-secret' -binary | base64)

# 200 — note no x-api-key is sent, proving the middleware exemption works
curl -i -X POST http://localhost:3100/api/webhooks/shopify/orders \
  -H 'Content-Type: application/json' \
  -H "X-Shopify-Hmac-Sha256: $SIG" \
  --data-binary "$BODY"

# 401 — same signature, altered body
curl -i -X POST http://localhost:3100/api/webhooks/shopify/orders \
  -H 'Content-Type: application/json' \
  -H "X-Shopify-Hmac-Sha256: $SIG" \
  --data-binary '{"id":123,"total_price":"0.01"}'
```

Verified behaviour: valid signature without `x-api-key` → 200; tampered body, wrong signature,
missing header, and a signature from the wrong secret → 401; valid signature with no email →
200 and not forwarded.

## Not done

- **No per-step checkout funnel.** This gives you completed orders, not which checkout step a
  buyer abandoned. That detail exists only in Shopify's Web Pixel events
  (`checkout_started`, `payment_info_submitted`, …), which run in Shopify's own sandbox — see
  the custom-pixel option in `Oakwood-Frontend/ANALYTICS.md`.
- **No company enrichment beyond the payload.** `company.id` and `company.location_id` are
  forwarded when Shopify includes them. This service holds the Admin token, so the order's full
  `purchasingEntity` could be fetched for reliable company data — deliberately skipped to keep
  the handler inside Shopify's 5-second response window.
- **No `orders/updated` or refunds**, so cancellations and refunds won't correct the revenue
  already reported.
