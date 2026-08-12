import type {BackendCollection, BackendPage, BackendProduct, ChemistryInfo, ProductVariant} from '~/api/_data/types';

const PRODUCT_FIELDS = `
  id
  title
  handle
  vendor
  description
  descriptionHtml
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

async function adminFetch<T>(
  query: string,
  variables: Record<string, unknown> = {},
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
      next: {revalidate: 60},
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
        nodes { id title handle body }
      }
    }
  `, {query: `handle:${handle}`});

  return data.pages.nodes[0] ?? null;
}

export async function getAllCollections(): Promise<BackendCollection[]> {
  const all: BackendCollection[] = [];
  let after: string | null = null;

  do {
    const data = await adminFetch<{
      collections: {
        pageInfo: {hasNextPage: boolean; endCursor: string | null};
        nodes: BackendCollection[];
      };
    }>(COLLECTIONS_QUERY, {first: 50, after});

    all.push(...data.collections.nodes);
    after = data.collections.pageInfo.hasNextPage
      ? data.collections.pageInfo.endCursor
      : null;
  } while (after);

  return all;
}

export async function getAllProducts(): Promise<BackendProduct[]> {
  const all: BackendProduct[] = [];
  let after: string | null = null;

  do {
    const data = await adminFetch<{
      products: {
        pageInfo: {hasNextPage: boolean; endCursor: string | null};
        nodes: Parameters<typeof mapProduct>[0][];
      };
    }>(PRODUCTS_QUERY, {first: 50, after});

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
