import {withCors, optionsResponse} from '../../../_lib/cors';
import {fetchOrderDeliveryEstimate} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

/**
 * When an order is promised to arrive — the "Expected by" date the storefront
 * shows on order detail.
 *
 * Needed because no API the storefront can call as a customer has it: the
 * Customer Account API's `Fulfillment.estimatedDeliveryAt` is null on this shop
 * and `Order.latestFulfillmentDeliveryDate` is rejected by the live API. The
 * promise sits on the fulfillment order's delivery method, which is Admin-only.
 *
 * Dates come back as plain `YYYY-MM-DD` **already converted to the shop's
 * timezone**, so the storefront can render them without knowing the timezone
 * and without a day-boundary bug. See `fetchOrderDeliveryEstimate`.
 *
 * **This route cannot authorize the caller.** The shared `x-api-key` identifies
 * the storefront, not a customer. The calling storefront route must have read
 * the same order through the Customer Account API as the signed-in customer
 * first — that read is the ownership check. Same contract as the sibling
 * draft-order routes.
 */
export async function GET(
  _req: Request,
  {params}: {params: Promise<{id: string}>},
) {
  try {
    const {id} = await params;

    if (!id) {
      return withCors({error: 'An order id is required'}, 400);
    }

    const orderId = id.startsWith('gid://')
      ? id
      : `gid://shopify/Order/${id}`;

    const estimate = await fetchOrderDeliveryEstimate(orderId);

    // A null estimate is a legitimate answer — an order with no delivery
    // promise — so it is 200 with a null body, not a 404.
    return withCors({estimate});
  } catch (err) {
    return withCors(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to fetch the delivery estimate',
      },
      500,
    );
  }
}
