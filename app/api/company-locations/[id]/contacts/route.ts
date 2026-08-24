import {withCors, optionsResponse} from '../../../_lib/cors';
import {changeCompanyContactRole, revokeCompanyContactRole} from '~/lib/shopify';

export function OPTIONS() {
  return optionsResponse();
}

/**
 * Changes a contact's role at this location, or removes them from it.
 *
 * Body: `{action: 'change-role' | 'remove', companyContactId,
 * roleAssignmentId?, companyContactRoleId?}`.
 *
 * "Remove" revokes the role assignment at *this* location only — the contact
 * stays with the company and keeps any other locations.
 *
 * The storefront route checks the location belongs to the signed-in customer,
 * and that their role permits this, before calling.
 */
export async function POST(
  req: Request,
  {params}: {params: Promise<{id: string}>},
) {
  try {
    const {id} = await params;
    const body = (await req.json()) as {
      action?: 'change-role' | 'remove';
      companyContactId?: string;
      roleAssignmentId?: string | null;
      companyContactRoleId?: string;
    };

    if (!body.companyContactId) {
      return withCors({error: 'A company contact id is required'}, 400);
    }

    let result;

    if (body.action === 'remove') {
      if (!body.roleAssignmentId) {
        return withCors(
          {error: 'A role assignment id is required to remove a contact'},
          400,
        );
      }
      result = await revokeCompanyContactRole(
        body.companyContactId,
        body.roleAssignmentId,
      );
    } else if (body.action === 'change-role') {
      if (!body.companyContactRoleId) {
        return withCors({error: 'A role id is required'}, 400);
      }
      result = await changeCompanyContactRole(
        body.companyContactId,
        id,
        body.roleAssignmentId ?? null,
        body.companyContactRoleId,
      );
    } else {
      return withCors({error: 'Unsupported action'}, 400);
    }

    if (!result.ok) {
      const described = result.userErrors.map((userError) => {
        const path = (userError.field ?? [])
          .filter((part) => part !== 'input')
          .join('.');

        return path ? `${path}: ${userError.message}` : userError.message;
      });

      return withCors(
        {
          error: described[0] ?? 'Shopify rejected the change',
          userErrors: result.userErrors,
        },
        422,
      );
    }

    return withCors({ok: true});
  } catch (err) {
    return withCors(
      {error: err instanceof Error ? err.message : 'Failed to update the contact'},
      500,
    );
  }
}
