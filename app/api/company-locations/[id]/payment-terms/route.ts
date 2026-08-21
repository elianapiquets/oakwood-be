import {withCors, optionsResponse} from '../../../_lib/cors';
import {
  getCompanyLocationBilling,
  updateCompanyLocationPaymentTerms,
} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

/**
 * Sets a company location's payment terms template.
 *
 * Body: `{paymentTermsTemplateId: string | null}` — null clears the terms.
 *
 * The current checkout flags are read first and passed through, because they
 * live in the same `buyerExperienceConfiguration` object this writes to.
 *
 * The storefront route checks the location belongs to the signed-in customer,
 * and that their role may edit it, before calling.
 */
export async function POST(
  req: Request,
  {params}: {params: Promise<{id: string}>},
) {
  try {
    const {id} = await params;
    const body = (await req.json()) as {
      paymentTermsTemplateId?: string | null;
    };

    const current = await getCompanyLocationBilling(id);

    const result = await updateCompanyLocationPaymentTerms(
      id,
      body.paymentTermsTemplateId ?? null,
      current?.checkout,
    );

    if (!result.ok) {
      const described = result.userErrors.map((userError) => {
        const path = (userError.field ?? [])
          .filter((part) => part !== 'input')
          .join('.');

        return path ? `${path}: ${userError.message}` : userError.message;
      });

      return withCors(
        {
          error: described[0] ?? 'Shopify rejected the payment terms',
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
          err instanceof Error
            ? err.message
            : 'Failed to set the payment terms',
      },
      500,
    );
  }
}
