import {withCors, optionsResponse} from '../../../_lib/cors';
import {getCompanyContactRoles} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

/**
 * The company's contact roles, with their gids.
 *
 * Only reachable from here: the Customer Account API has no
 * `Company.contactRoles`, so the storefront can't read the ids the assign
 * mutation needs.
 */
export async function GET(
  _req: Request,
  {params}: {params: Promise<{id: string}>},
) {
  try {
    const {id} = await params;
    return withCors(await getCompanyContactRoles(id));
  } catch (err) {
    return withCors(
      {
        error:
          err instanceof Error ? err.message : 'Failed to fetch contact roles',
      },
      500,
    );
  }
}
