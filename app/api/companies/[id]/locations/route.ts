import {withCors, optionsResponse} from '../../../_lib/cors';
import {
  createCompanyLocation,
  type CreateCompanyLocationInput,
} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

/**
 * Creates a location on the given company.
 *
 * This endpoint trusts its caller for *which* company: the shared `x-api-key`
 * checked in `middleware.ts` authenticates the storefront, not an individual
 * customer, so it cannot tell whether the company is the caller's own. The
 * storefront route derives the company id from the signed-in customer's session
 * and never accepts it from a form, which is what makes that safe.
 */
export async function POST(
  req: Request,
  {params}: {params: Promise<{id: string}>},
) {
  try {
    const {id} = await params;
    const {assignContactId, ...input} = (await req.json()) as
      CreateCompanyLocationInput & {assignContactId?: string};

    if (!input?.name?.trim()) {
      return withCors({error: 'A location name is required'}, 400);
    }

    const result = await createCompanyLocation(id, input, assignContactId);

    if (!result.ok) {
      // Shopify's `field` path names the exact culprit — e.g.
      // ['input','shippingAddress','zip'] — and losing it turns an actionable
      // "Zip is invalid" into a mystery. Address errors in particular are
      // semantic: Shopify checks the zip against the country and province, so
      // a well-formed zip is still rejected if it doesn't belong to the state.
      const described = result.userErrors.map((userError) => {
        const path = (userError.field ?? [])
          .filter((part) => part !== 'input')
          .join('.');

        return path ? `${path}: ${userError.message}` : userError.message;
      });

      // 422, not 500: Shopify rejected the input (duplicate externalId, invalid
      // name), which the caller can fix and retry.
      return withCors(
        {
          error: described[0] ?? 'Shopify rejected the location',
          userErrors: result.userErrors,
        },
        422,
      );
    }

    return withCors(result.location, 201);
  } catch (err) {
    return withCors(
      {
        error:
          err instanceof Error ? err.message : 'Failed to create the location',
      },
      500,
    );
  }
}
