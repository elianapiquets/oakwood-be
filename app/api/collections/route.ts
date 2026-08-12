import {withCors, optionsResponse} from '../_lib/cors';
import {getAllCollections} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

export async function GET() {
  try {
    const collections = await getAllCollections();
    return withCors(collections);
  } catch (err) {
    return withCors(
      {error: err instanceof Error ? err.message : 'Failed to fetch collections'},
      500,
    );
  }
}
