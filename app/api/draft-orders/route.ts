import {withCors, optionsResponse} from '../_lib/cors';
import {createDraftOrder, type CreateDraftOrderInput} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

/**
 * Creates a B2B draft order from a storefront quote request.
 *
 * Body: `CreateDraftOrderInput` — line items, the company/contact/location
 * triple, and an optional shipping address and requested shipping method.
 *
 * **The storefront route is what authorizes this.** The shared `x-api-key`
 * identifies the storefront, not a customer, so the company, the contact and
 * the location are all re-read from the signed-in session before the call is
 * made, and the line items come from the server-side cart rather than the
 * browser. Nothing here can tell whether that happened — see the note at the
 * top of the storefront's BACKEND_ENDPOINTS.md.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<CreateDraftOrderInput>;

    const missing = (
      ['companyId', 'companyContactId', 'companyLocationId'] as const
    ).filter((key) => !body[key]);

    if (missing.length) {
      return withCors({error: `Missing: ${missing.join(', ')}`}, 400);
    }

    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return withCors({error: 'A quote needs at least one line item'}, 400);
    }

    const result = await createDraftOrder(body as CreateDraftOrderInput);

    if (!result.ok) {
      const described = result.userErrors.map((userError) => {
        const path = (userError.field ?? [])
          .filter((part) => part !== 'input')
          .join('.');

        return path ? `${path}: ${userError.message}` : userError.message;
      });

      return withCors(
        {
          error: described[0] ?? 'Shopify rejected the draft order',
          userErrors: result.userErrors,
        },
        422,
      );
    }

    return withCors({draftOrder: result.draftOrder});
  } catch (err) {
    return withCors(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to create the draft order',
      },
      500,
    );
  }
}
