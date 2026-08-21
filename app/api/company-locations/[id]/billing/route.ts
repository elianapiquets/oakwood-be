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

    return withCors(billing);
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
