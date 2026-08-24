import {withCors, optionsResponse} from '../_lib/cors';
import {getAllProducts} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limitParam = url.searchParams.get('limit');
    const products = await getAllProducts();
    const result = limitParam ? products.slice(0, parseInt(limitParam, 10)) : products;
    return withCors(result);
  } catch (err) {
    return withCors(
      {error: err instanceof Error ? err.message : 'Failed to fetch products'},
      500,
    );
  }
}
