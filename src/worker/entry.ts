// The render worker, bundled for a browser Worker by scripts/worker-bundle.mjs and embedded in
// main.js. A port of smiles-renderer's dist/worker.js: the same OpenChemLib calls, the same
// warm-up and the same `compose` (which sanitizes every structure), answering over postMessage
// instead of shared memory. OpenChemLib is imported statically: the bundle carries it, so there
// is nothing to load lazily, and a failure to evaluate it fails the worker's start.
import { Molecule } from 'openchemlib';
import { compose, OutputTooLarge } from '#renderer/dist/compose.js';
import type { RenderResult } from '@reonarudo/smiles-renderer';
import type { MoleculeRequest, Reply, Request, Started } from '../protocol';

type MoleculeClass = typeof Molecule;

interface Scope {
  onmessage: ((event: { data: Request }) => void) | null;
  postMessage(message: Started | Reply): void;
}
const scope = self as unknown as Scope;

/** `Class$S19: SmilesParser: dangling ring closure: 1; position:4` — the position is 0-based. */
const prefixes = /^(?:[\w$]+:\s*)?SmilesParser:\s*/;
const positioned = /(?:[;,]\s*|\s+)position:\s*(\d+)\s*$/i;

type Failure = { message: string; line: number; column?: number };

/**
 * Depict one SMILES string, or one SMARTS pattern with its query features annotated on the atoms
 * and bonds they constrain. Invisible hit targets (`class="event"`) exist for OpenChemLib's
 * interactive editor and are dropped.
 */
function depict(M: MoleculeClass, molecule: MoleculeRequest, notation: Request['notation']): string | Failure {
  let parsed: InstanceType<MoleculeClass>;
  try {
    // Explicit rather than `guess`: a mistyped SMILES must fail, not quietly become a pattern.
    parsed = M.fromSmiles(molecule.smiles, { smartsMode: notation });
  } catch (error) {
    const raw = (error instanceof Error ? error.message : String(error)).replace(prefixes, '').trim();
    const match = positioned.exec(raw);
    const position = match ? Number(match[1]) : -1;
    // A position outside the string is not a place on the line; the message keeps it as written.
    if (match && position <= molecule.smiles.length) {
      return { message: raw.slice(0, match.index), line: molecule.line, column: molecule.column + position };
    }
    return { message: raw || `${notation} could not be parsed`, line: molecule.line };
  }
  if (parsed.getAllAtoms() === 0) return { message: 'no atoms found', line: molecule.line };
  // The canvas bounds the depiction: a molecule that fits keeps the standard bond length and is
  // cropped to its extent; a larger one is scaled down to fit. A pattern is drawn half as large
  // again, so its query annotations, set at two thirds of the atom-label size, stay legible.
  return parsed.toSVG(600, 400, 'ocl', {
    autoCrop: true,
    autoCropMargin: 6,
    fontWeight: 'normal',
    ...(notation === 'smarts' ? { maxAVBL: 36 } : {})
  }).replace(/^[ \t]*<(?:line|circle) id="[^"]*" class="event"[^>]*\/>\r?\n/gm, '');
}

function render(M: MoleculeClass, { notation, molecules, prefix, outputBytes }: Omit<Request, 'id'>): RenderResult {
  const tooLarge: RenderResult = { status: 'failure', message: `smiles output exceeds the ${outputBytes}-byte limit` };
  const cells: { svg: string; label?: string }[] = [];
  let raw = 0;
  for (const molecule of molecules) {
    const drawn = depict(M, molecule, notation);
    if (typeof drawn !== 'string') return { status: 'failure', ...drawn };
    // OpenChemLib's raw output is held to the limit as it grows, so a fence too large to return
    // is not first spent depicting and parsing the rest.
    raw += drawn.length;
    if (raw > outputBytes) return tooLarge;
    cells.push(molecule.label === undefined ? { svg: drawn } : { svg: drawn, label: molecule.label });
  }
  try {
    return { status: 'success', output: compose(cells, prefix, outputBytes), notes: [] };
  } catch (error) {
    if (error instanceof OutputTooLarge) return tooLarge;
    return { status: 'failure', message: (error as Error).message };
  }
}

try {
  // The first depiction in a fresh worker costs a few hundred milliseconds of warm-up that must
  // not be charged to an author's budget, so it is spent here, before this worker reports ready.
  render(Molecule, { notation: 'smiles', molecules: [{ smiles: 'CC(=O)Oc1ccccc1C(=O)O', line: 1, column: 1 }], prefix: '', outputBytes: 1e6 });
  render(Molecule, { notation: 'smarts', molecules: [{ smiles: '[C,N;!H0]~*', line: 1, column: 1 }], prefix: '', outputBytes: 1e6 });
  scope.onmessage = ({ data: { id, ...request } }) => {
    let result: RenderResult;
    try {
      result = render(Molecule, request);
    } catch {
      // OpenChemLib threw where it never should; its state is not trusted again.
      scope.postMessage({ type: 'reply', id, result: { status: 'failure', message: 'OpenChemLib stopped unexpectedly' }, discard: true });
      return;
    }
    scope.postMessage({ type: 'reply', id, result });
  };
  scope.postMessage({ type: 'started' });
} catch {
  // The error would name bundle internals; the reason stays plain.
  scope.postMessage({ type: 'failed', reason: 'OpenChemLib could not start' });
}
