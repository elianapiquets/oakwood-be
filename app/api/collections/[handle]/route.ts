import {withCors, optionsResponse} from '../../../api/_lib/cors';
import {getCollectionByHandle} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(
  _req: Request,
  {params}: {params: Promise<{handle: string}>},
) {
  try {
    const {handle} = await params;
    const collection = await getCollectionByHandle(handle);

    if (!collection) {
      return withCors({error: `No collection found for handle: ${handle}`}, 404);
    }

    return withCors(collection);
  } catch (err) {
    return withCors(
      {error: err instanceof Error ? err.message : 'Failed to fetch collection'},
      500,
    );
  }
}
