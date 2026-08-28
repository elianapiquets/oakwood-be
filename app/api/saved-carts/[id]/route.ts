import {withCors, optionsResponse} from '../../_lib/cors';
import {deleteSavedCart} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

/**
 * Removes a saved cart from a customer's list.
 *
 * `customerId` is required and is not decoration: the index it de-references is
 * per customer, and the id also scopes the delete to a cart that customer
 * actually owns. As with the sibling routes, the shared `x-api-key` identifies
 * the storefront rather than a customer, so the calling storefront route must
 * take the customer id from the signed-in session, never from the request.
 */
export async function DELETE(
  req: Request,
  {params}: {params: Promise<{id: string}>},
) {
  try {
    const {id} = await params;
    const customerId = new URL(req.url).searchParams.get('customerId');

    if (!id || !customerId) {
      return withCors({error: 'A saved cart id and customerId are required'}, 400);
    }

    const savedCartId = id.startsWith('gid://')
      ? id
      : `gid://shopify/Metaobject/${id}`;

    const result = await deleteSavedCart(customerId, savedCartId);

    if (!result.ok) {
      return withCors({error: result.error}, 422);
    }

    return withCors({ok: true});
  } catch (err) {
    return withCors(
      {error: err instanceof Error ? err.message : 'Failed to delete the saved cart'},
      500,
    );
  }
}
