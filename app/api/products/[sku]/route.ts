import {withCors, optionsResponse} from '../../_lib/cors';
import {getProductBySku} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(
  _req: Request,
  {params}: {params: Promise<{sku: string}>},
) {
  try {
    const {sku} = await params;
    const product = await getProductBySku(sku);

    if (!product) {
      return withCors({error: `No product found for SKU: ${sku}`}, 404);
    }

    return withCors(product);
  } catch (err) {
    return withCors(
      {error: err instanceof Error ? err.message : 'Failed to fetch product'},
      500,
    );
  }
}
