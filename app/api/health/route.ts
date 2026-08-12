import {withCors, optionsResponse} from '../_lib/cors';
import {getAllProducts} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

export async function GET() {
  try {
    const products = await getAllProducts();
    return withCors({
      status: 'ok',
      service: 'oakwood-backend',
      version: '0.1.0',
      products: products.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return withCors(
      {
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      503,
    );
  }
}
