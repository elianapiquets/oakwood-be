import {withCors, optionsResponse} from '../_lib/cors';
import {getPaymentTermsTemplates} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

export async function GET() {
  try {
    return withCors(await getPaymentTermsTemplates());
  } catch (err) {
    return withCors(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to fetch payment terms templates',
      },
      500,
    );
  }
}
