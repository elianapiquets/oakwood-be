import {withCors, optionsResponse} from '../_lib/cors';
import {getAllProducts, getProductsByHandles} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const handlesParam = url.searchParams.get('handles');

    if (handlesParam) {
      const handles = handlesParam.split(',').filter(Boolean);
      const products = await getProductsByHandles(handles);
      return withCors(products);
    }

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
