export type HazmatInfo = {
  unNumber: string;
  hazardClass: string;
  packingGroup: string;
  properShippingName: string;
};

export type ChemistryInfo = {
  casNumber: string | null;
  molecularFormula: string | null;
  molecularWeight: string | null;
  purity: string | null;
  boilingPoint: string | null;
  meltingPoint: string | null;
  flashPoint: string | null;
  appearance: string | null;
  storageConditions: string | null;
  hazmat: HazmatInfo | null;
};

export type ProductVariant = {
  id: string;
  sku: string;
  title: string;
  price: string;
  availableForSale: boolean;
  selectedOptions: Array<{name: string; value: string}>;
};

export type BackendPage = {
  id: string;
  title: string;
  handle: string;
  body: string;
  seo: {
    title: string | null;
    description: string | null;
  };
};

export type BackendCollection = {
  id: string;
  title: string;
  handle: string;
  image: {
    url: string;
    altText: string | null;
    width: number | null;
    height: number | null;
  } | null;
};

export type BackendProduct = {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  description: string;
  descriptionHtml: string;
  seo: {
    title: string | null;
    description: string | null;
  };
  featuredImage: {
    url: string;
    altText: string | null;
    width: number | null;
    height: number | null;
  } | null;
  options: Array<{name: string; values: string[]}>;
  variants: ProductVariant[];
  chemistry: ChemistryInfo;
};
