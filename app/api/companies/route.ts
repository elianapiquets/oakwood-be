import {withCors, optionsResponse} from '../_lib/cors';
import {
  createCompanyWithLocation,
  getAllCompanies,
  type CreateCompanyInput,
} from '~/lib/shopify';

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

/**
 * Creates a company with its first location, and makes the given customer its
 * Location admin.
 *
 * Body: `{customerId, companyName, externalId, location}`.
 *
 * `customerId` is trusted from the caller because the storefront route reads it
 * from the signed-in session and never from a form — the shared `x-api-key`
 * here identifies the storefront, not a customer.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateCompanyInput & {
      customerId?: string;
    };

    if (!body.customerId || !body.companyName?.trim() || !body.location?.name) {
      return withCors(
        {error: 'A customer id, company name and location name are required'},
        400,
      );
    }

    const result = await createCompanyWithLocation(body.customerId, {
      companyName: body.companyName.trim(),
      location: body.location,
    });

    if (!result.ok) {
      // 422: Shopify or our own duplicate check rejected the input, which the
      // caller can correct and retry.
      return withCors({error: result.error}, 422);
    }

    return withCors(
      {
        ok: true,
        companyId: result.companyId,
        locationId: result.locationId,
        ...(result.warning ? {warning: result.warning} : {}),
      },
      201,
    );
  } catch (err) {
    return withCors(
      {error: err instanceof Error ? err.message : 'Failed to create the company'},
      500,
    );
  }
}
