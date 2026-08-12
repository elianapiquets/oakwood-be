import {withCors, optionsResponse} from '../../../../api/_lib/cors';
import {getProductByHandle} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(
  _req: Request,
  {params}: {params: Promise<{handle: string}>},
) {
  try {
    const {handle} = await params;
    const product = await getProductByHandle(handle);

    if (!product) {
      return withCors({error: `No product found for handle: ${handle}`}, 404);
    }

    return withCors(product);
  } catch (err) {
    return withCors(
      {error: err instanceof Error ? err.message : 'Failed to fetch product'},
      500,
    );
  }
}
