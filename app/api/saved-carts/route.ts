import {withCors, optionsResponse} from '../_lib/cors';
import {
  createSavedCart,
  listSavedCarts,
  type SaveCartInput,
} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

/**
 * A customer's saved carts — named baskets parked to reorder later.
 *
 * Stored as `saved_cart` metaobjects, found through the customer's
 * `custom.saved_carts` index rather than by querying metaobjects: **metaobject
 * field filtering does not work.** Verified on Admin 2025-07, 2026-07 and
 * 2026-10 — `metaobjects(query: "customer:gid://…")` matches every record
 * regardless of owner. Reading the index makes ownership structural.
 *
 * **This route cannot authorize the caller, and does not try to.** The shared
 * `x-api-key` identifies the storefront, not a customer, so passing any
 * `customerId` returns that customer's carts. The storefront route must derive
 * the id from the signed-in session and never from the request — see
 * `app/routes/api.saved-carts.ts` there. Same contract as the sibling
 * draft-order and delivery-estimate routes.
 */
export async function GET(req: Request) {
  try {
    const customerId = new URL(req.url).searchParams.get('customerId');

    if (!customerId) {
      return withCors({error: 'A customerId is required'}, 400);
    }

    return withCors({savedCarts: await listSavedCarts(customerId)});
  } catch (err) {
    return withCors(
      {
        error:
          err instanceof Error ? err.message : 'Failed to list saved carts',
      },
      500,
    );
  }
}

/** Creates a saved cart. Same authorization caveat as `GET`. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<SaveCartInput>;

    if (!body.customerId) {
      return withCors({error: 'A customerId is required'}, 400);
    }

    if (!body.name?.trim()) {
      return withCors({error: 'A saved cart needs a name'}, 400);
    }

    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return withCors({error: 'A saved cart needs at least one item'}, 400);
    }

    const result = await createSavedCart({
      customerId: body.customerId,
      name: body.name.trim(),
      lines: body.lines,
      ...(body.note ? {note: body.note} : {}),
    });

    if (!result.ok) return withCors({error: result.error}, 422);

    return withCors(result);
  } catch (err) {
    return withCors(
      {error: err instanceof Error ? err.message : 'Failed to save the cart'},
      500,
    );
  }
}
