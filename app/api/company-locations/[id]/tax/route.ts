import {withCors, optionsResponse} from '../../../_lib/cors';
import {updateCompanyLocationTaxSettings} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

/**
 * Sets a company location's tax registration id and tax-exempt flag.
 *
 * Body: `{taxRegistrationId?: string | null, taxExempt?: boolean}`.
 *
 * The storefront route checks the location belongs to the signed-in customer,
 * and that their role may edit it, before calling — the shared `x-api-key` here
 * identifies the storefront, not a customer.
 */
export async function POST(
  req: Request,
  {params}: {params: Promise<{id: string}>},
) {
  try {
    const {id} = await params;
    const body = (await req.json()) as {
      taxRegistrationId?: string | null;
      taxExempt?: boolean;
    };

    const result = await updateCompanyLocationTaxSettings(id, body);

    if (!result.ok) {
      const described = result.userErrors.map((userError) => {
        const path = (userError.field ?? [])
          .filter((part) => part !== 'input')
          .join('.');

        return path ? `${path}: ${userError.message}` : userError.message;
      });

      return withCors(
        {
          error: described[0] ?? 'Shopify rejected the tax settings',
          userErrors: result.userErrors,
        },
        422,
      );
    }

    return withCors({ok: true});
  } catch (err) {
    return withCors(
      {
        error:
          err instanceof Error ? err.message : 'Failed to set the tax settings',
      },
      500,
    );
  }
}
