import {withCors, optionsResponse} from '../../_lib/cors';
import {getMolFile} from '~/lib/jchem';

export function OPTIONS() {
  return optionsResponse();
}

/** A structure as MOL text, for loading back into the sketcher. Callers pass
 * either JChem's `cd_id` (from a results row) or a SMILES string. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    const structure = String(body?.cdId ?? body?.structure ?? '').trim();

    if (!structure) {
      return withCors({error: 'A cdId or structure is required'}, 400);
    }

    return withCors({molfile: await getMolFile(structure)});
  } catch (err) {
    console.error('[structure-search/molfile]', err);

    return withCors({error: 'Could not load that structure'}, 502);
  }
}
