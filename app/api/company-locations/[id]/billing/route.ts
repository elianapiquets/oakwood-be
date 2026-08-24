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

    // `checkout` is deliberately not exposed. It exists so the payment-terms
    // write can preserve the sibling flags in `buyerExperienceConfiguration`,
    // which happens inside the backend — it never needs to cross the wire, and
    // a field nobody consumes is a field that can be wrong unnoticed.
    const {checkout: _internalOnly, ...response} = billing;

    return withCors(response);
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
