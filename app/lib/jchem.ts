/**
 * The wire to ChemAxon JChem — Oakwood's structure search service, and the only
 * thing here that talks to Oakwood's own infrastructure rather than Shopify.
 *
 * The contract comes from the WSDL the legacy site generated its client from,
 * not from guesswork. Two details it's easy to get wrong: the target namespace
 * really does end in a double slash, and `MWLow`/`MWHigh` are declared as
 * strings, with "0" meaning "no bound".
 */

const JCHEM_ENDPOINT =
  process.env.JCHEM_ENDPOINT ??
  'https://webservices.oakwoodchemical.com/StructureSearchingWS2022.asmx';

// Not a typo — see the WSDL's targetNamespace.
const JCHEM_NS = 'http://webservices.oakwoodchemical.com//';

/** JChem's own `searchType`. `6` (superstructure) exists but has never had a UI. */
export const STRUCTURE_SEARCH_TYPES = {
  substructure: 2,
  similarity: 3,
  exact: 4,
} as const;

export type StructureQuery = {
  /** MOL text or a SMILES string — the service accepts either. */
  structure: string;
  searchType: number;
  stereo: boolean;
  similarity: number;
  mwLow: number | null;
  mwHigh: number | null;
};

/** One `ProductDetailResult`, renamed to say what the fields actually hold. */
export type StructureHit = {
  catNumber: string;
  description: string;
  cas: string;
  /** The WSDL calls this `URL`. It is a numeric style key, not a URL. */
  styleKey: string;
  mw: string;
  smiles: string;
  /** JChem's row id — what `GetMolFile` takes. */
  cdId: string;
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function tag(block: string, name: string) {
  const found = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block);

  return found ? unescapeXml(found[1]) : '';
}

async function callJChem(operation: string, body: string): Promise<string> {
  const response = await fetch(JCHEM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `${JCHEM_NS}${operation}`,
    },
    body: `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body><${operation} xmlns="${JCHEM_NS}">${body}</${operation}></soap:Body>
</soap:Envelope>`,
  });

  const text = await response.text();

  if (!response.ok) throw new Error(`JChem responded ${response.status}`);

  // A SOAP fault arrives as a 200. The legacy code's note is worth keeping: a
  // "not well-formed xml" fault almost always means a bad licence key.
  const fault = /<faultstring>([\s\S]*?)<\/faultstring>/.exec(text);

  if (fault) throw new Error(`JChem fault: ${fault[1].trim()}`);

  return text;
}

function securityKey() {
  const key = process.env.STRUCTURE_SEARCH_SECURITY_KEY;

  if (!key) {
    throw new Error(
      'STRUCTURE_SEARCH_SECURITY_KEY is not set. Set it, or use USE_STRUCTURE_FIXTURE=true.',
    );
  }

  return key;
}

export function usingFixture() {
  return process.env.USE_STRUCTURE_FIXTURE === 'true';
}

/**
 * Stand-in for the real service, which sits inside Oakwood's network behind a
 * ChemAxon key we don't have yet. The catalogue numbers are real SKUs in the
 * `oakwood-poc` store, so the lookup that follows does real work — they are
 * chemically meaningless, and the store's one genuine chemical product has empty
 * SKUs on every variant, so nothing can resolve to it.
 */
function fixtureHits(query: StructureQuery): StructureHit[] {
  const rows: StructureHit[] = [
    {
      catNumber: '23234',
      description: 'Fixture hit — exact match stand-in',
      cas: '000-00-0',
      styleKey: '20144',
      mw: '154.01',
      smiles: query.structure.slice(0, 60),
      cdId: 'fixture-1',
    },
    {
      catNumber: '1222',
      description: 'Fixture hit — broader match stand-in',
      cas: '111-11-1',
      styleKey: '20145',
      mw: '88.15',
      smiles: query.structure.slice(0, 60),
      cdId: 'fixture-2',
    },
  ];

  // Exact returning fewer than substructure is the one behaviour worth faking,
  // so the search-type control visibly does something.
  return query.searchType === STRUCTURE_SEARCH_TYPES.exact
    ? rows.slice(0, 1)
    : rows;
}

export async function searchStructures(
  query: StructureQuery,
): Promise<StructureHit[]> {
  if (usingFixture()) return fixtureHits(query);

  // Argument order is the WSDL's, and it is neither alphabetical nor obvious.
  const body =
    `<securitykey>${escapeXml(securityKey())}</securitykey>` +
    `<s>${escapeXml(query.structure)}</s>` +
    `<searchType>${query.searchType}</searchType>` +
    `<stereoInfo>${query.stereo ? 0 : 1}</stereoInfo>` +
    `<similarity>${Math.round(query.similarity)}</similarity>` +
    `<tautomerSearch>0</tautomerSearch>` +
    `<MWLow>${query.mwLow ?? 0}</MWLow>` +
    `<MWHigh>${query.mwHigh ?? 0}</MWHigh>` +
    `<InternalUse>0</InternalUse>`;

  const xml = await callJChem('GetStructureID', body);
  const blocks =
    xml.match(/<ProductDetailResult>[\s\S]*?<\/ProductDetailResult>/g) ?? [];

  return blocks.map((block) => ({
    catNumber: tag(block, 'CatNumber'),
    description: tag(block, 'Description'),
    cas: tag(block, 'CAS'),
    styleKey: tag(block, 'URL'),
    mw: tag(block, 'MW'),
    smiles: tag(block, 'cd_smiles'),
    cdId: tag(block, 'cd_id'),
  }));
}

/** Turns a SMILES string or a `cd_id` back into MOL text for the sketcher. */
export async function getMolFile(structure: string): Promise<string> {
  if (usingFixture()) return '';

  const xml = await callJChem(
    'GetMolFile',
    `<securitykey>${escapeXml(securityKey())}</securitykey>` +
      `<structure>${escapeXml(structure)}</structure>`,
  );

  return tag(xml, 'GetMolFileResult');
}
