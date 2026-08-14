import {withCors, optionsResponse} from '../_lib/cors';
import {getAllCompanies} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

export async function GET() {
  try {
    const companies = await getAllCompanies();
return withCors(companies);
  } catch (err) {
    return withCors(
      {error: err instanceof Error ? err.message : 'Failed to fetch companies'},
      500,
    );
  }
}
