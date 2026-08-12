import {withCors, optionsResponse} from '../../../api/_lib/cors';
import {getPageByHandle} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(
  _req: Request,
  {params}: {params: Promise<{handle: string}>},
) {
  try {
    const {handle} = await params;
    const page = await getPageByHandle(handle);

    if (!page) {
      return withCors({error: `No page found for handle: ${handle}`}, 404);
    }

    return withCors(page);
  } catch (err) {
    return withCors(
      {error: err instanceof Error ? err.message : 'Failed to fetch page'},
      500,
    );
  }
}
