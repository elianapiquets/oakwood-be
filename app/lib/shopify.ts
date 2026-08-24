import type {BackendCollection, BackendPage, BackendProduct, ChemistryInfo, ProductVariant} from '~/api/_data/types';

const PRODUCT_FIELDS = `
  id
  title
  handle
  vendor
  description
  descriptionHtml
  seo { title description }
  featuredImage { url altText width height }
  options { name values }
  variants(first: 20) {
    nodes {
      id
      sku
      title
      price
      availableForSale
      selectedOptions { name value }
    }
  }
  metafields(first: 20, namespace: "chemistry") {
    nodes { key value }
  }
`;

const PRODUCTS_QUERY = `
  query Products($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { ${PRODUCT_FIELDS} }
    }
  }
`;

const PRODUCT_BY_HANDLE_QUERY = `
  query ProductByHandle($handle: String!) {
    productByHandle(handle: $handle) { ${PRODUCT_FIELDS} }
  }
`;

function getEnv() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!domain || !token) {
    throw new Error('SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN must be set');
  }
  return {domain, token};
}

/*
 * Invalidate-after-write was tried here and does not work in this setup, so
 * don't reach for it again without re-testing:
 *
 * Tagging the read and calling `revalidateTag(tag, {expire: 0})` from the
 * mutation left the endpoint still serving the old value — Shopify held
 * `taxExempt: true` while the read returned `false`. Next 16 changed
 * `revalidateTag` to *set an expiry profile* rather than purge, and the
 * immediate equivalent, `updateTag`, is Server-Action-only — these are Route
 * Handlers.
 *
 * So mutable per-location reads pass `noCache` instead. It costs one Admin call
 * per page view (query cost 2 against a 20,000 bucket) and is always correct.
 */

async function adminFetch<T>(
  query: string,
  variables: Record<string, unknown> = {},
  /**
   * `mutation` — writes must never be cached; `next: {revalidate}` on one risks
   * Next serving a cached response for what is supposed to be a write.
   *
   * `noCache` — for reads whose value changes and is per-customer. The 60s
   * revalidate below is an explicit opt-in to Next's Data Cache, so a read left
   * on the default keeps returning a stale value for up to a minute after a
   * mutation changes it. Catalogue data can tolerate that; a company location's
   * settings cannot.
   */
  {mutation = false, noCache = false}: {mutation?: boolean; noCache?: boolean} = {},
): Promise<T> {
  const {domain, token} = getEnv();
  const res = await fetch(
    `https://${domain}/admin/api/2025-07/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({query, variables}),
      ...(mutation || noCache
        ? {cache: 'no-store' as const}
        : {next: {revalidate: 60}}),
    },
  );

  if (!res.ok) {
    throw new Error(`Shopify Admin API ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(json.errors.map((e: {message: string}) => e.message).join(', '));
  }
  return json.data as T;
}

function metafield(
  metafields: Array<{key: string; value: string} | null>,
  key: string,
): string | null {
  return metafields.find((m) => m?.key === key)?.value ?? null;
}

function mapChemistry(
  metafields: Array<{key: string; value: string} | null>,
): ChemistryInfo {
  const unNumber = metafield(metafields, 'un_number');
  const hazardClass = metafield(metafields, 'hazard_class');
  const packingGroup = metafield(metafields, 'packing_group');
  const properShippingName = metafield(metafields, 'proper_shipping_name');

  const hazmat =
    unNumber && hazardClass && packingGroup && properShippingName
      ? {unNumber, hazardClass, packingGroup, properShippingName}
      : null;

  return {
    casNumber: metafield(metafields, 'cas_number'),
    molecularFormula: metafield(metafields, 'molecular_formula'),
    molecularWeight: metafield(metafields, 'molecular_weight'),
    purity: metafield(metafields, 'purity'),
    boilingPoint: metafield(metafields, 'boiling_point'),
    meltingPoint: metafield(metafields, 'melting_point'),
    flashPoint: metafield(metafields, 'flash_point'),
    appearance: metafield(metafields, 'appearance'),
    storageConditions: metafield(metafields, 'storage_conditions'),
    hazmat,
  };
}

type RawVariant = {
  id: string;
  sku: string;
  title: string;
  price: string;
  availableForSale: boolean;
  selectedOptions: Array<{name: string; value: string}>;
};

type RawProduct = {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  description: string;
  descriptionHtml: string;
  seo: {title: string | null; description: string | null};
  featuredImage: {url: string; altText: string | null; width: number | null; height: number | null} | null;
  options: Array<{name: string; values: string[]}>;
  variants: {nodes: RawVariant[]};
  metafields: {nodes: Array<{key: string; value: string}>};
};

function mapVariant(v: RawVariant): ProductVariant {
  return {
    id: v.id,
    sku: v.sku ?? '',
    title: v.title,
    price: v.price,
    availableForSale: v.availableForSale,
    selectedOptions: v.selectedOptions ?? [],
  };
}

function mapProduct(raw: RawProduct): BackendProduct {
  return {
    id: raw.id,
    title: raw.title,
    handle: raw.handle,
    vendor: raw.vendor,
    description: raw.description ?? '',
    descriptionHtml: raw.descriptionHtml ?? '',
    seo: raw.seo ?? {title: null, description: null},
    featuredImage: raw.featuredImage ?? null,
    options: raw.options ?? [],
    variants: raw.variants.nodes.map(mapVariant),
    chemistry: mapChemistry(raw.metafields.nodes),
  };
}

const COLLECTIONS_QUERY = `
  query Collections($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        image {
          url
          altText
          width
          height
        }
      }
    }
  }
`;

const COLLECTION_BY_HANDLE_QUERY = `
  query CollectionByHandle($handle: String!) {
    collectionByHandle(handle: $handle) {
      id
      title
      handle
      description
      image {
        url
        altText
        width
        height
      }
      products(first: 250) {
        nodes { ${PRODUCT_FIELDS} }
      }
    }
  }
`;

export type BackendCollectionDetail = BackendCollection & {
  description: string | null;
  products: BackendProduct[];
};

export async function getCollectionByHandle(
  handle: string,
): Promise<BackendCollectionDetail | null> {
  const data = await adminFetch<{
    collectionByHandle: {
      id: string;
      title: string;
      handle: string;
      description: string | null;
      image: BackendCollection['image'];
      products: {nodes: Parameters<typeof mapProduct>[0][]};
    } | null;
  }>(COLLECTION_BY_HANDLE_QUERY, {handle});

  const raw = data.collectionByHandle;
  if (!raw) return null;

  return {
    id: raw.id,
    title: raw.title,
    handle: raw.handle,
    description: raw.description,
    image: raw.image,
    products: raw.products.nodes.map(mapProduct),
  };
}

export async function getPageByHandle(handle: string): Promise<BackendPage | null> {
  const data = await adminFetch<{
    pages: {nodes: BackendPage[]};
  }>(`
    query PageByHandle($query: String!) {
      pages(first: 1, query: $query) {
        nodes { id title handle body seo { title description } }
      }
    }
  `, {query: `handle:${handle}`});

  return data.pages.nodes[0] ?? null;
}

type CollectionsPage = {
  collections: {
    pageInfo: {hasNextPage: boolean; endCursor: string | null};
    nodes: BackendCollection[];
  };
};

export async function getAllCollections(): Promise<BackendCollection[]> {
  const all: BackendCollection[] = [];
  let after: string | null = null;

  do {
    const data: CollectionsPage = await adminFetch<CollectionsPage>(COLLECTIONS_QUERY, {first: 50, after});

    all.push(...data.collections.nodes);
    after = data.collections.pageInfo.hasNextPage
      ? data.collections.pageInfo.endCursor
      : null;
  } while (after);

  return all;
}

type ProductsPage = {
  products: {
    pageInfo: {hasNextPage: boolean; endCursor: string | null};
    nodes: Parameters<typeof mapProduct>[0][];
  };
};

export async function getAllProducts(): Promise<BackendProduct[]> {
  const all: BackendProduct[] = [];
  let after: string | null = null;

  do {
    const data: ProductsPage = await adminFetch<ProductsPage>(PRODUCTS_QUERY, {first: 50, after});

    all.push(...data.products.nodes.map(mapProduct));
    after = data.products.pageInfo.hasNextPage
      ? data.products.pageInfo.endCursor
      : null;
  } while (after);

  return all;
}

export async function getProductByHandle(
  handle: string,
): Promise<BackendProduct | null> {
  const data = await adminFetch<{
    productByHandle: Parameters<typeof mapProduct>[0] | null;
  }>(PRODUCT_BY_HANDLE_QUERY, {handle});

  return data.productByHandle ? mapProduct(data.productByHandle) : null;
}

export async function getProductBySku(
  sku: string,
): Promise<BackendProduct | null> {
  const all = await getAllProducts();
  return (
    all.find((p) =>
      p.variants.some((v) => v.sku.toLowerCase() === sku.toLowerCase()),
    ) ?? null
  );
}

const SEARCH_PRODUCTS_QUERY = `
  query SearchProducts($query: String!, $first: Int!) {
    products(first: $first, query: $query) {
      nodes { ${PRODUCT_FIELDS} }
    }
  }
`;

export async function searchProducts(
  query: string,
  limit = 10,
): Promise<BackendProduct[]> {
  const data = await adminFetch<{
    products: {nodes: Parameters<typeof mapProduct>[0][]};
  }>(SEARCH_PRODUCTS_QUERY, {query, first: limit});
  return data.products.nodes.map(mapProduct);
}

export async function getProductsByHandles(
  handles: string[],
): Promise<BackendProduct[]> {
  const results = await Promise.all(
    handles.map((h) => getProductByHandle(h).catch(() => null)),
  );
  return results.filter((p): p is BackendProduct => p !== null);
}

export type BackendCompany = {id: string; name: string};

export async function getAllCompanies(): Promise<BackendCompany[]> {
  const data = await adminFetch<{
    companies: {nodes: BackendCompany[]};
  }>(`{ companies(first: 50) { nodes { id name } } }`);
  return data.companies.nodes;
}

/**
 * Billing details for a B2B company location, for the storefront's
 * /account/company/[id] page. Lives here because the Customer Account API — the
 * only API the storefront can call as a logged-in customer — doesn't expose
 * any of it: its `buyerExperienceConfiguration` carries only `deposit` and
 * `payNowOnly`, and it has no tax-settings field at all.
 *
 * Payment methods are deliberately absent. Introspecting this store's live
 * Admin schema shows `CompanyLocation` has 29 fields and none of them return
 * stored payment methods or instruments (the only payment-adjacent ones are
 * `storeCreditAccounts` and `taxSettings`). Shopify's own hosted account UI
 * does render a "Payment methods" section, so it reads them through a private
 * internal endpoint rather than any public API. The field is returned as an
 * empty array so the storefront contract stays stable if a path turns up.
 */
export type CompanyLocationBilling = {
  paymentTerms: {
    /** The `PaymentTermsTemplate` gid, so the edit form can preselect it. */
    id: string;
    name: string;
    dueInDays: number | null;
    description: string | null;
    type: string | null;
  } | null;
  paymentMethods: Array<{id: string; label: string; detail: string | null}>;
  tax: {
    taxId: string | null;
    taxExempt: boolean | null;
  };
  /**
   * The rest of `buyerExperienceConfiguration`. Returned so a payment-terms
   * update can send it back unchanged — see `updateCompanyLocationPaymentTerms`.
   */
  checkout: {
    checkoutToDraft: boolean | null;
    editableShippingAddress: boolean | null;
  };
};

const COMPANY_LOCATION_BILLING_QUERY = `
  query CompanyLocationBilling($id: ID!) {
    companyLocation(id: $id) {
      id
      name
      buyerExperienceConfiguration {
        checkoutToDraft
        editableShippingAddress
        paymentTermsTemplate {
          id
          name
          description
          dueInDays
          paymentTermsType
        }
      }
      taxSettings {
        taxExempt
        taxRegistrationId
      }
    }
  }
`;

/**
 * `locationId` accepts either the numeric id the storefront puts in its URL or
 * a full `gid://shopify/CompanyLocation/...`.
 */
export async function getCompanyLocationBilling(
  locationId: string,
): Promise<CompanyLocationBilling | null> {
  const id = locationId.startsWith('gid://')
    ? locationId
    : `gid://shopify/CompanyLocation/${locationId}`;

  const data = await adminFetch<{
    companyLocation: {
      id: string;
      name: string;
      buyerExperienceConfiguration: {
        checkoutToDraft: boolean | null;
        editableShippingAddress: boolean | null;
        paymentTermsTemplate: {
          id: string;
          name: string | null;
          description: string | null;
          dueInDays: number | null;
          paymentTermsType: string | null;
        } | null;
      } | null;
      taxSettings: {
        taxExempt: boolean | null;
        taxRegistrationId: string | null;
      } | null;
    } | null;
    // Not cached: read straight after a mutation changes it, and a stale
    // `taxExempt` reads as a save that silently failed.
  }>(COMPANY_LOCATION_BILLING_QUERY, {id}, {noCache: true});

  const location = data.companyLocation;
  if (!location) return null;

  const template = location.buyerExperienceConfiguration?.paymentTermsTemplate;

  const checkout = location.buyerExperienceConfiguration;

  return {
    paymentTerms: template?.name
      ? {
          id: template.id,
          name: template.name,
          dueInDays: template.dueInDays ?? null,
          description: template.description ?? null,
          type: template.paymentTermsType ?? null,
        }
      : null,
    paymentMethods: [],
    tax: {
      taxId: location.taxSettings?.taxRegistrationId ?? null,
      taxExempt: location.taxSettings?.taxExempt ?? null,
    },
    checkout: {
      checkoutToDraft: checkout?.checkoutToDraft ?? null,
      editableShippingAddress: checkout?.editableShippingAddress ?? null,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Company locations — creation
 * ------------------------------------------------------------------ */

export type PaymentTermsTemplate = {
  id: string;
  name: string;
  dueInDays: number | null;
  paymentTermsType: string | null;
};

const PAYMENT_TERMS_TEMPLATES_QUERY = `
  query PaymentTermsTemplates {
    paymentTermsTemplates {
      id
      name
      dueInDays
      paymentTermsType
    }
  }
`;

/**
 * The real templates, because `companyLocationCreate` needs a
 * `PaymentTermsTemplate` gid — these can't be hardcoded from a screenshot.
 *
 * `FIXED` is filtered out: it represents "due on a specific date" and is
 * meaningless without an accompanying date, which a plain dropdown can't
 * supply. Shopify's own company-location form omits it for the same reason.
 * Everything else is passed through, including `RECEIPT` ("Due on receipt"),
 * which the admin form happens not to list but which is perfectly valid.
 */
export async function getPaymentTermsTemplates(): Promise<
  PaymentTermsTemplate[]
> {
  const data = await adminFetch<{
    paymentTermsTemplates: PaymentTermsTemplate[];
  }>(PAYMENT_TERMS_TEMPLATES_QUERY);

  return (data.paymentTermsTemplates ?? []).filter(
    (template) => template.paymentTermsType !== 'FIXED',
  );
}

export type CompanyAddressInput = {
  address1?: string;
  address2?: string;
  city?: string;
  zoneCode?: string;
  zip?: string;
  /** A `CountryCode` enum value, e.g. 'US'. */
  countryCode?: string;
  recipient?: string;
  phone?: string;
};

export type CreateCompanyLocationInput = {
  name: string;
  externalId?: string;
  /**
   * Optional on `CompanyLocationInput`, but the mutation rejects a location
   * without one: `userErrors: [{field: ['input','shippingAddress']}]`.
   */
  shippingAddress?: CompanyAddressInput;
  /** Ignored by Shopify when `billingSameAsShipping` is true. */
  billingAddress?: CompanyAddressInput;
  taxRegistrationId?: string;
  taxExempt?: boolean;
  billingSameAsShipping?: boolean;
  buyerExperienceConfiguration?: {
    paymentTermsTemplateId?: string;
    checkoutToDraft?: boolean;
    editableShippingAddress?: boolean;
  };
};

const COMPANY_CONTACT_ROLES_QUERY = `
  query CompanyContactRoles($companyId: ID!) {
    company(id: $companyId) {
      contactRoles(first: 10) {
        nodes {
          id
          name
        }
      }
    }
  }
`;

const COMPANY_CONTACT_ASSIGN_ROLE_MUTATION = `
  mutation CompanyContactAssignRole(
    $companyContactId: ID!
    $companyContactRoleId: ID!
    $companyLocationId: ID!
  ) {
    companyContactAssignRole(
      companyContactId: $companyContactId
      companyContactRoleId: $companyContactRoleId
      companyLocationId: $companyLocationId
    ) {
      companyContactRoleAssignment {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/** The role a location's creator is given. */
const CREATOR_ROLE_NAME = 'Location admin';

/**
 * Grants a company contact a role at a location.
 *
 * A freshly created location has no contacts, and the storefront's own
 * authorization check reads the signed-in customer's `companyContacts.locations`
 * — so without this the creator gets a 404 on the location they just made, and
 * it never appears in their locations list either.
 */
async function assignContactToLocation(
  companyId: string,
  companyContactId: string,
  companyLocationId: string,
): Promise<{ok: true} | {ok: false; message: string}> {
  const roles = await adminFetch<{
    company: {contactRoles: {nodes: Array<{id: string; name: string}>}} | null;
  }>(COMPANY_CONTACT_ROLES_QUERY, {companyId});

  const available = roles.company?.contactRoles?.nodes ?? [];
  const role =
    available.find((candidate) => candidate.name === CREATOR_ROLE_NAME) ??
    available[0];

  if (!role) {
    return {ok: false, message: 'The company has no contact roles to assign'};
  }

  const assigned = await adminFetch<{
    companyContactAssignRole: {
      userErrors: Array<{field: string[] | null; message: string}>;
    };
  }>(
    COMPANY_CONTACT_ASSIGN_ROLE_MUTATION,
    {companyContactId, companyContactRoleId: role.id, companyLocationId},
    {mutation: true},
  );

  const userErrors = assigned.companyContactAssignRole?.userErrors ?? [];

  if (userErrors.length) {
    return {ok: false, message: userErrors[0].message};
  }

  return {ok: true};
}

export type CreateCompanyLocationResult =
  | {ok: true; location: {id: string; name: string}}
  | {ok: false; userErrors: Array<{field: string[] | null; message: string}>};

const COMPANY_LOCATION_CREATE_MUTATION = `
  mutation CompanyLocationCreate($companyId: ID!, $input: CompanyLocationInput!) {
    companyLocationCreate(companyId: $companyId, input: $input) {
      companyLocation {
        id
        name
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * `companyId` accepts either the numeric id or a full gid.
 *
 * Note there is no market to set: `CompanyLocationInput` has no market field,
 * and this store's only market targets the US *region* rather than a list of
 * locations, so a new US location joins it automatically.
 */
export async function createCompanyLocation(
  companyId: string,
  input: CreateCompanyLocationInput,
  /**
   * Contact to grant `Location admin` at the new location. Without it the
   * location is invisible to the customer who created it — see
   * `assignContactToLocation`.
   */
  assignContactId?: string,
): Promise<CreateCompanyLocationResult> {
  const id = companyId.startsWith('gid://')
    ? companyId
    : `gid://shopify/Company/${companyId}`;

  const data = await adminFetch<{
    companyLocationCreate: {
      companyLocation: {id: string; name: string} | null;
      userErrors: Array<{field: string[] | null; message: string}>;
    };
  }>(COMPANY_LOCATION_CREATE_MUTATION, {companyId: id, input}, {mutation: true});

  const payload = data.companyLocationCreate;

  // `userErrors` is how Shopify reports a rejected name or a duplicate
  // externalId. It arrives with a 200 and an empty `errors`, so adminFetch
  // can't see it — the caller has to.
  if (payload?.userErrors?.length || !payload?.companyLocation) {
    return {ok: false, userErrors: payload?.userErrors ?? []};
  }

  if (assignContactId) {
    const assignment = await assignContactToLocation(
      id,
      assignContactId,
      payload.companyLocation.id,
    );

    // The location exists at this point, so this is reported rather than
    // swallowed: an unassigned location is one its creator can't open.
    if (!assignment.ok) {
      return {
        ok: false,
        userErrors: [
          {
            field: null,
            message: `Location created, but the contact could not be assigned to it: ${assignment.message}`,
          },
        ],
      };
    }
  }

  return {ok: true, location: payload.companyLocation};
}


/* ------------------------------------------------------------------ *
 * Company locations — address assignment
 * ------------------------------------------------------------------ */

export type CompanyAddressType = 'BILLING' | 'SHIPPING';

const COMPANY_LOCATION_ASSIGN_ADDRESS_MUTATION = `
  mutation CompanyLocationAssignAddress(
    $locationId: ID!
    $address: CompanyAddressInput!
    $addressTypes: [CompanyAddressType!]!
  ) {
    companyLocationAssignAddress(
      locationId: $locationId
      address: $address
      addressTypes: $addressTypes
    ) {
      addresses {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export type AssignCompanyAddressResult =
  | {ok: true}
  | {ok: false; userErrors: Array<{field: string[] | null; message: string}>};

/**
 * Sets a location's shipping and/or billing address.
 *
 * This is the only way to change one: `CompanyLocationUpdateInput` has no
 * address fields at all (verified by introspection at 2025-07), so
 * `companyLocationUpdate` can't do it. Passing both types is how "same as
 * shipping" is expressed after creation.
 *
 * `locationId` accepts either the numeric id or a full gid.
 */
export async function assignCompanyLocationAddress(
  locationId: string,
  address: CompanyAddressInput,
  addressTypes: CompanyAddressType[],
): Promise<AssignCompanyAddressResult> {
  const id = locationId.startsWith('gid://')
    ? locationId
    : `gid://shopify/CompanyLocation/${locationId}`;

  const data = await adminFetch<{
    companyLocationAssignAddress: {
      userErrors: Array<{field: string[] | null; message: string}>;
    };
  }>(
    COMPANY_LOCATION_ASSIGN_ADDRESS_MUTATION,
    {locationId: id, address, addressTypes},
    {mutation: true},
  );

  const userErrors =
    data.companyLocationAssignAddress?.userErrors ?? [];

  if (userErrors.length) return {ok: false, userErrors};

  return {ok: true};
}


/* ------------------------------------------------------------------ *
 * Company locations — tax settings
 * ------------------------------------------------------------------ */

const COMPANY_LOCATION_TAX_SETTINGS_MUTATION = `
  mutation CompanyLocationTaxSettingsUpdate(
    $companyLocationId: ID!
    $taxRegistrationId: String
    $taxExempt: Boolean
  ) {
    companyLocationTaxSettingsUpdate(
      companyLocationId: $companyLocationId
      taxRegistrationId: $taxRegistrationId
      taxExempt: $taxExempt
    ) {
      companyLocation {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export type UpdateTaxSettingsResult =
  | {ok: true}
  | {ok: false; userErrors: Array<{field: string[] | null; message: string}>};

/**
 * Sets a location's tax registration id and tax-exempt flag.
 *
 * `companyLocationUpdate` can't do this — `CompanyLocationUpdateInput` carries
 * no tax fields (verified by introspection at 2025-07). This dedicated mutation
 * is the route, and it handles both values in one call.
 *
 * `taxRegistrationId: null` clears the id; the exemption list is left alone,
 * since nothing collects one yet.
 */
export async function updateCompanyLocationTaxSettings(
  locationId: string,
  settings: {taxRegistrationId?: string | null; taxExempt?: boolean},
): Promise<UpdateTaxSettingsResult> {
  const id = locationId.startsWith('gid://')
    ? locationId
    : `gid://shopify/CompanyLocation/${locationId}`;

  const data = await adminFetch<{
    companyLocationTaxSettingsUpdate: {
      userErrors: Array<{field: string[] | null; message: string}>;
    };
  }>(
    COMPANY_LOCATION_TAX_SETTINGS_MUTATION,
    {
      companyLocationId: id,
      taxRegistrationId: settings.taxRegistrationId ?? null,
      taxExempt: settings.taxExempt,
    },
    {mutation: true},
  );

  const userErrors =
    data.companyLocationTaxSettingsUpdate?.userErrors ?? [];

  if (userErrors.length) return {ok: false, userErrors};

  return {ok: true};
}


/* ------------------------------------------------------------------ *
 * Company locations — payment terms
 * ------------------------------------------------------------------ */

const COMPANY_LOCATION_UPDATE_MUTATION = `
  mutation CompanyLocationUpdate(
    $companyLocationId: ID!
    $input: CompanyLocationUpdateInput!
  ) {
    companyLocationUpdate(
      companyLocationId: $companyLocationId
      input: $input
    ) {
      companyLocation {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Sets a location's payment terms template.
 *
 * Unlike tax and addresses, this one *is* on `CompanyLocationUpdateInput`, under
 * `buyerExperienceConfiguration`. The catch: that object also carries
 * `checkoutToDraft` and `editableShippingAddress`, and it isn't documented
 * whether a partial object merges or replaces. So the current values are read
 * first and sent back alongside — clobbering a location's checkout settings as
 * a side effect of changing its payment terms would be a nasty surprise.
 *
 * `templateId: null` means "no payment terms".
 */
export async function updateCompanyLocationPaymentTerms(
  locationId: string,
  templateId: string | null,
  /** Current checkout flags, preserved. Omit and they're left untouched. */
  checkout?: {
    checkoutToDraft?: boolean | null;
    editableShippingAddress?: boolean | null;
  },
): Promise<AssignCompanyAddressResult> {
  const id = locationId.startsWith('gid://')
    ? locationId
    : `gid://shopify/CompanyLocation/${locationId}`;

  const data = await adminFetch<{
    companyLocationUpdate: {
      userErrors: Array<{field: string[] | null; message: string}>;
    };
  }>(
    COMPANY_LOCATION_UPDATE_MUTATION,
    {
      companyLocationId: id,
      input: {
        buyerExperienceConfiguration: {
          paymentTermsTemplateId: templateId,
          ...(typeof checkout?.checkoutToDraft === 'boolean'
            ? {checkoutToDraft: checkout.checkoutToDraft}
            : {}),
          ...(typeof checkout?.editableShippingAddress === 'boolean'
            ? {editableShippingAddress: checkout.editableShippingAddress}
            : {}),
        },
      },
    },
    {mutation: true},
  );

  const userErrors = data.companyLocationUpdate?.userErrors ?? [];

  if (userErrors.length) return {ok: false, userErrors};

  return {ok: true};
}


/* ------------------------------------------------------------------ *
 * Company contacts — roles at a location
 * ------------------------------------------------------------------ */

export type CompanyContactRoleOption = {id: string; name: string};

/**
 * The company's contact roles.
 *
 * Has to come from the Admin API: the Customer Account API has no
 * `Company.contactRoles` (validated against live 2026-04), so the storefront
 * can't read the role gids the assign mutation needs.
 */
export async function getCompanyContactRoles(
  companyId: string,
): Promise<CompanyContactRoleOption[]> {
  const id = companyId.startsWith('gid://')
    ? companyId
    : `gid://shopify/Company/${companyId}`;

  const data = await adminFetch<{
    company: {contactRoles: {nodes: CompanyContactRoleOption[]}} | null;
  }>(COMPANY_CONTACT_ROLES_QUERY, {companyId: id});

  return data.company?.contactRoles?.nodes ?? [];
}

const COMPANY_CONTACT_REVOKE_ROLE_MUTATION = `
  mutation CompanyContactRevokeRole(
    $companyContactId: ID!
    $companyContactRoleAssignmentId: ID!
  ) {
    companyContactRevokeRole(
      companyContactId: $companyContactId
      companyContactRoleAssignmentId: $companyContactRoleAssignmentId
    ) {
      revokedCompanyContactRoleAssignmentId
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Removes a contact from one location by revoking their role assignment there.
 *
 * Deliberately *not* `companyContactRemoveFromCompany` or
 * `companyContactDelete`: those detach the contact from the company entirely,
 * including its other locations. Revoking one assignment is the narrow action
 * this UI offers.
 */
export async function revokeCompanyContactRole(
  companyContactId: string,
  roleAssignmentId: string,
): Promise<AssignCompanyAddressResult> {
  const data = await adminFetch<{
    companyContactRevokeRole: {
      userErrors: Array<{field: string[] | null; message: string}>;
    };
  }>(
    COMPANY_CONTACT_REVOKE_ROLE_MUTATION,
    {companyContactId, companyContactRoleAssignmentId: roleAssignmentId},
    {mutation: true},
  );

  const userErrors = data.companyContactRevokeRole?.userErrors ?? [];

  if (userErrors.length) return {ok: false, userErrors};

  return {ok: true};
}

/**
 * Changes a contact's role at one location.
 *
 * Revokes the existing assignment before assigning the new one. Assigning alone
 * isn't obviously idempotent — it could leave the contact holding two roles at
 * the same location — and two conflicting roles would be worse than a failed
 * change, so the old one goes first.
 *
 * If the revoke succeeds and the assign fails, the contact is left with no role
 * at this location. That's reported, not swallowed, so it can be retried.
 */
export async function changeCompanyContactRole(
  companyContactId: string,
  companyLocationId: string,
  roleAssignmentId: string | null,
  companyContactRoleId: string,
): Promise<AssignCompanyAddressResult> {
  const locationId = companyLocationId.startsWith('gid://')
    ? companyLocationId
    : `gid://shopify/CompanyLocation/${companyLocationId}`;

  if (roleAssignmentId) {
    const revoked = await revokeCompanyContactRole(
      companyContactId,
      roleAssignmentId,
    );
    if (!revoked.ok) return revoked;
  }

  const data = await adminFetch<{
    companyContactAssignRole: {
      userErrors: Array<{field: string[] | null; message: string}>;
    };
  }>(
    COMPANY_CONTACT_ASSIGN_ROLE_MUTATION,
    {companyContactId, companyContactRoleId, companyLocationId: locationId},
    {mutation: true},
  );

  const userErrors = data.companyContactAssignRole?.userErrors ?? [];

  if (userErrors.length) return {ok: false, userErrors};

  return {ok: true};
}
