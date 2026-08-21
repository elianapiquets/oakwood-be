import {withCors, optionsResponse} from '../../../_lib/cors';
import {
  assignCompanyLocationAddress,
  type CompanyAddressInput,
  type CompanyAddressType,
} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

/**
 * Sets a company location's shipping and/or billing address.
 *
 * Body: `{address: CompanyAddressInput, addressTypes: ['SHIPPING'|'BILLING']}`.
 *
 * As with the create endpoint, the shared `x-api-key` authenticates the
 * storefront rather than a customer, so it can't tell whose location this is.
 * The storefront route checks the location belongs to the signed-in customer
 * before calling.
 */
export async function POST(
  req: Request,
  {params}: {params: Promise<{id: string}>},
) {
  try {
    const {id} = await params;
    const body = (await req.json()) as {
      address?: CompanyAddressInput;
      addressTypes?: CompanyAddressType[];
    };

    const addressTypes = body.addressTypes ?? [];

    if (!body.address || !addressTypes.length) {
      return withCors(
        {error: 'An address and at least one address type are required'},
        400,
      );
    }

    const result = await assignCompanyLocationAddress(
      id,
      body.address,
      addressTypes,
    );

    if (!result.ok) {
      // Shopify's `field` path names the offending field — e.g.
      // ['address','zip'] for a zip that doesn't match its province.
      const described = result.userErrors.map((userError) => {
        const path = (userError.field ?? [])
          .filter((part) => part !== 'input')
          .join('.');

        return path ? `${path}: ${userError.message}` : userError.message;
      });

      return withCors(
        {
          error: described[0] ?? 'Shopify rejected the address',
          userErrors: result.userErrors,
        },
        422,
      );
    }

    return withCors({ok: true});
  } catch (err) {
    return withCors(
      {error: err instanceof Error ? err.message : 'Failed to set the address'},
      500,
    );
  }
}
