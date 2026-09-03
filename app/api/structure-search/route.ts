import {withCors, optionsResponse} from '../_lib/cors';
import {searchProducts} from '~/lib/shopify';
import type {BackendProduct} from '~/api/_data/types';
import {searchStructures, type StructureQuery} from '~/lib/jchem';

export function OPTIONS() {
  return optionsResponse();
}

/** Shopify's product query has limits, and a structure search returning more
 * than this is a bad search rather than a useful result. */
const MAX_HITS = 50;

/** A drawn molecule is a few KB. This only stops a hand-crafted body from
 * pushing megabytes at the chemistry service. */
const MAX_STRUCTURE_LENGTH = 200_000;

/** Catalogue numbers look like `044321-1G`. Anything outside this can't be one,
 * and has no business being interpolated into a Shopify query. */
const SAFE_CAT_NUMBER = /^[A-Za-z0-9][A-Za-z0-9._/\- ]*$/;

function asNumber(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function asOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

/** The sketcher's MOL when something was drawn, the pasted SMILES otherwise —
 * JChem accepts either. */
function readStructure(body: Record<string, unknown>) {
  return String(body.mol ?? '').trim() || String(body.smiles ?? '').trim();
}

function toQuery(
  body: Record<string, unknown>,
  structure: string,
): StructureQuery {
  return {
    structure,
    searchType: asNumber(body.searchType, 4),
    stereo: body.stereo === true || body.stereo === 'true',
    similarity: asNumber(body.similarity, 50),
    mwLow: asOptionalNumber(body.mwLow),
    mwHigh: asOptionalNumber(body.mwHigh),
  };
}

/**
 * Structure search — draw a molecule, get the products that match it.
 *
 * Two services in order: JChem decides which catalogue numbers match, then
 * Shopify turns those into products. This route owns only the join, and reuses
 * `searchProducts` because a catalogue number is a variant SKU and Shopify's
 * product query already filters on `sku:` — so no new GraphQL, and results come
 * back in the shape text search already returns.
 *
 * Ordering is JChem's: for a similarity search the row order *is* the ranking,
 * and Shopify knows nothing about it.
 *
 * Without the ChemAxon key, run with `USE_STRUCTURE_FIXTURE=true`.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!body) return withCors({error: 'A JSON body is required'}, 400);

    const structure = readStructure(body);

    if (!structure) {
      return withCors({error: 'A structure or SMILES string is required'}, 400);
    }

    if (structure.length > MAX_STRUCTURE_LENGTH) {
      return withCors({error: 'That structure is too large to search'}, 413);
    }

    const hits = await searchStructures(toQuery(body, structure));

    const catNumbers = [
      ...new Set(hits.map((hit) => hit.catNumber).filter(Boolean)),
    ]
      .filter((catNumber) => SAFE_CAT_NUMBER.test(catNumber))
      .slice(0, MAX_HITS);

    if (!catNumbers.length) return withCors([]);

    const products = await searchProducts(
      catNumbers.map((catNumber) => `sku:"${catNumber}"`).join(' OR '),
      MAX_HITS,
    );

    const rank = new Map(catNumbers.map((catNumber, i) => [catNumber, i]));
    const rankOf = (product: BackendProduct) =>
      Math.min(
        ...product.variants.map((variant) => rank.get(variant.sku) ?? Infinity),
        Infinity,
      );

    return withCors([...products].sort((a, b) => rankOf(a) - rankOf(b)));
  } catch (err) {
    // Detail stays server-side: JChem faults quote the request, and the "key is
    // not set" case would tell a caller how this service is configured.
    console.error('[structure-search]', err);

    return withCors({error: 'Structure search is unavailable'}, 502);
  }
}
