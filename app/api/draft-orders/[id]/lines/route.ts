import {withCors, optionsResponse} from '../../../_lib/cors';
import {fetchDraftOrderLines} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

/**
 * Line items of one draft order, including the variant id per line, so the
 * storefront's "Buy again" can rebuild a cart from a quote.
 *
 * Needed because the Customer Account API — the only API the storefront can
 * call as a signed-in customer — exposes no variant on `DraftOrderLineItem`,
 * and the Storefront API can't resolve a variant from a sku. See
 * `fetchDraftOrderLines`.
 *
 * **This route cannot authorize the caller, and does not try to.** The shared
 * `x-api-key` identifies the storefront, not a customer, so nothing here can
 * tell whose quote this is. The storefront route that calls it must first read
 * the same draft order through the Customer Account API as the signed-in
 * customer and 404 if that read fails — that read is the ownership check. Same
 * contract as the sibling `POST /api/draft-orders`; see the note at the top of
 * the storefront's BACKEND_ENDPOINTS.md.
 *
 * `id` may be a numeric id or a full `gid://shopify/DraftOrder/…`.
 */
export async function GET(
  _req: Request,
  {params}: {params: Promise<{id: string}>},
) {
  try {
    const {id} = await params;

    if (!id) {
      return withCors({error: 'A draft order id is required'}, 400);
    }

    const draftOrderId = id.startsWith('gid://')
      ? id
      : `gid://shopify/DraftOrder/${id}`;

    const lines = await fetchDraftOrderLines(draftOrderId);

    if (!lines) {
      return withCors({error: `No draft order found for id: ${id}`}, 404);
    }

    return withCors({lines});
  } catch (err) {
    return withCors(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to fetch draft order lines',
      },
      500,
    );
  }
}
