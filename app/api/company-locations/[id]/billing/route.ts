import {withCors, optionsResponse} from '../../../_lib/cors';
import {getCompanyLocationBilling} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(
  _req: Request,
  {params}: {params: Promise<{id: string}>},
) {
  try {
    const {id} = await params;
    const billing = await getCompanyLocationBilling(id);

    if (!billing) {
      return withCors({error: `No company location found for id: ${id}`}, 404);
    }

    // `checkout` stays internal apart from one field. It exists so the
    // payment-terms write can preserve the sibling flags in
    // `buyerExperienceConfiguration` without a round trip, and a field nobody
    // consumes is a field that can be wrong unnoticed.
    //
    // `editableShippingAddress` now has a consumer: the storefront's quote page
    // gates "Use a different address" on it, and the Customer Account API has
    // no equivalent — its `BuyerExperienceConfiguration` exposes only `deposit`,
    // `payNowOnly` and `paymentTermsTemplate`. `checkoutToDraft` still has no
    // reader, so it is still withheld.
    const {checkout, ...rest} = billing;

    return withCors({
      ...rest,
      checkout: {editableShippingAddress: checkout?.editableShippingAddress ?? null},
    });
  } catch (err) {
    return withCors(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to fetch company location billing',
      },
      500,
    );
  }
}
