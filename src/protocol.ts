import type { Notation, RenderResult } from '@reonarudo/smiles-renderer';

/**
 * Messages between the plugin and its render worker (docs/adr/0001-runtime-host.md).
 *
 * smiles-renderer's own worker answers through a SharedArrayBuffer so its host can block with
 * `Atomics.wait`. Obsidian renders code blocks asynchronously, so this worker answers with plain
 * messages instead: no shared memory, no cross-origin isolation requirement. A request is what the
 * library's runtime posts to its worker: the fence's molecules, already split and positioned.
 */

/** One molecule line, as the library's `parseMolecules` hands it to its worker. */
export interface MoleculeRequest {
  smiles: string;
  label?: string;
  /** 1-based line in the rendered source. */
  line: number;
  /** 1-based column of the string in its line. */
  column: number;
}

/** The plugin asks for one render. */
export interface Request {
  id: number;
  notation: Notation;
  molecules: MoleculeRequest[];
  /** `smiles-<8 hex of sha256(notation \0 source)>-`: the composed root's id and scoped style. */
  prefix: string;
  outputBytes: number;
}

/** The worker's first message, once: its engine started, or why it did not. */
export type Started = { type: 'started' } | { type: 'failed'; reason: string };

/** The worker's answer to one request, and whether its engine must not be used again. */
export interface Reply {
  type: 'reply';
  id: number;
  result: RenderResult;
  discard?: true;
}

export type WorkerMessage = Started | Reply;
