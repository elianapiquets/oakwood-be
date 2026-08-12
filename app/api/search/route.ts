import {withCors, optionsResponse} from '../_lib/cors';
import {searchProducts} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('q') ?? '';
    const limit = Number(url.searchParams.get('limit') || 10);

    if (!q.trim()) {
      return withCors([]);
    }

    const products = await searchProducts(q, limit);
    return withCors(products);
  } catch (err) {
    return withCors(
      {error: err instanceof Error ? err.message : 'Search failed'},
      500,
    );
  }
}
