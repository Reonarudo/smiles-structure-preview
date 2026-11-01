import type { Notation, RenderInput, RenderResult } from '@reonarudo/smiles-renderer';
import type { FenceAttributes } from './attributes';
import { parseMolecules, type MoleculeLine } from './molecules';
import { themeStructure } from './structure-theme';

/**
 * The DOM every smiles and smarts code block gets: the port of smiles-markdown-preview's
 * markdown.ts, built as nodes rather than HTML strings. Text from the note (captions, alt text,
 * labels, the source view, error messages) only ever becomes text nodes or attribute values. Each
 * structure is the renderer's output, already reduced to an SVG allowlist by its sanitizer; it is
 * parsed as XML, never as HTML.
 *
 * Each line of a fence is its own render of the bare string, so the library draws it alone and
 * unlabelled, and the row, the labels and a failing line's report are built here: a bad molecule
 * costs only its own cell, and the row wraps to the column.
 *
 *   div.smiles-fence[data-fence-key][data-view?]
 *     button.smiles-toggle   both glyphs; the stylesheet shows the one naming the other view
 *     div.smiles-rendering   the structure, or a div.smiles-row of div.smiles-molecule cells (each a
 *                            structure or an error card, with a span.smiles-label beneath), in a
 *                            figure when captioned or aligned; or the empty fence's error card
 *     pre > code.language-smiles|smarts   the fence body, hidden until the reader flips the fence
 */

/** The class on every structure's root `<svg>`, and the prefix of every class the stylesheet selects. */
export const BASE_CLASS = 'smiles';

/** How the error reports name what a line of each notation holds. */
export const WORDING: Record<Notation, { name: string; line: string; whole: string }> = {
  smiles: { name: 'SMILES', line: 'SMILES string', whole: 'molecule' },
  smarts: { name: 'SMARTS', line: 'SMARTS pattern', whole: 'pattern' }
};

/** One render of a line, as the plugin asks for it: through the cache and the worker. */
export type Render = (input: RenderInput) => Promise<RenderResult>;

/** The text of the error report shown in place of one structure. */
export function describe(result: Exclude<RenderResult, { status: 'success' }>, molecule: MoleculeLine, notation: Notation): string {
  const wording = WORDING[notation];
  if (result.status === 'timeout') {
    const seconds = (result.budget / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 });
    return `Depiction took longer than ${seconds} s (the Depiction timeout setting). ` +
      `Shorten the ${wording.line}, split the ${wording.whole}, or raise the limit.`;
  }
  if (result.status === 'unavailable') {
    return `The ${wording.name} renderer could not start: ${result.reason}. It will retry on the next render.`;
  }
  // The library saw the string alone, so its column counts from the string's first character; the
  // author's counts from the start of the fence line.
  const { smiles } = molecule;
  const column = result.column;
  const where = column === undefined
    ? `at line ${molecule.line}`
    : `at line ${molecule.line}, column ${molecule.offset + column}`;
  // Echo the string with a caret under the column, so the author need not count characters.
  const caret = column !== undefined && column >= 1 && column <= smiles.length + 1
    ? `\n${' '.repeat(column - 1)}^`
    : '';
  return `${result.message} ${where}\n\n${smiles}${caret}`;
}

/** The fence key: FNV-1a, 32-bit, of the exact body, as eight hex digits. */
export function fenceKey(body: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    hash ^= body.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// Both glyphs ship; the stylesheet shows the one naming the view a click leads to. They are the
// Lucide icons Obsidian draws its own block buttons with: `code-2`, as on the "Edit this block"
// button Mermaid and every rendered code block get in Live Preview, and `network` for the way back.
const LUCIDE = 'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICON_CODE = `<svg ${LUCIDE} class="svg-icon lucide-code-2 ${BASE_CLASS}-icon-code">` +
  '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>';
const ICON_GRAPH = `<svg ${LUCIDE} class="svg-icon lucide-network ${BASE_CLASS}-icon-graph">` +
  '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/>' +
  '<path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/></svg>';

/** The button's name in each view: what a click shows. */
const LABEL_SHOW_SOURCE = 'Show source';
const LABEL_SHOW_RENDERING = 'Show structure';

/** An SVG document's root, imported into `doc`, or nothing when the markup is not a well-formed `<svg>`. */
function parseSvg(doc: Document, markup: string): Element | undefined {
  const Parser = doc.defaultView?.DOMParser ?? DOMParser;
  const parsed = new Parser().parseFromString(markup, 'image/svg+xml');
  const root = parsed.documentElement;
  if (!root || root.localName !== 'svg' || parsed.getElementsByTagName('parsererror').length > 0) return undefined;
  return doc.importNode(root, true);
}

export interface FenceParts {
  wrapper: HTMLElement;
  button: HTMLButtonElement;
  rendering: HTMLElement;
}

/** The wrapper with its toggle, an empty rendering slot, and the source view in the fence's own word. */
export function buildFence(doc: Document, body: string, key: string, notation: Notation): FenceParts {
  const wrapper = doc.createElement('div');
  wrapper.className = `${BASE_CLASS}-fence`;
  wrapper.setAttribute('data-fence-key', key);

  const button = doc.createElement('button');
  button.type = 'button';
  // `clickable-icon` is Obsidian's own icon-button class, so the button takes the app's look.
  button.className = `${BASE_CLASS}-toggle clickable-icon`;
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', LABEL_SHOW_SOURCE);
  for (const icon of [ICON_CODE, ICON_GRAPH]) button.append(parseSvg(doc, icon)!);

  const rendering = doc.createElement('div');
  rendering.className = `${BASE_CLASS}-rendering`;

  const pre = doc.createElement('pre');
  const code = doc.createElement('code');
  code.className = `language-${notation}`;
  code.textContent = body;
  pre.append(code);

  wrapper.append(button, rendering, pre);
  return { wrapper, button, rendering };
}

/** Flip a wrapper between its rendering and its source view. */
export function setView(wrapper: Element, source: boolean): void {
  if (source) wrapper.setAttribute('data-view', 'source');
  else wrapper.removeAttribute('data-view');
  const button = wrapper.querySelector(`.${BASE_CLASS}-toggle`);
  button?.setAttribute('aria-pressed', source ? 'true' : 'false');
  button?.setAttribute('aria-label', source ? LABEL_SHOW_RENDERING : LABEL_SHOW_SOURCE);
}

export function isSourceView(wrapper: Element): boolean {
  return wrapper.getAttribute('data-view') === 'source';
}

/** A status line while a render is slow to arrive. */
export function showLoading(rendering: HTMLElement, notation: Notation): void {
  const doc = rendering.ownerDocument;
  const line = doc.createElement('p');
  line.className = `${BASE_CLASS}-loading`;
  line.setAttribute('role', 'status');
  line.textContent = `Rendering ${WORDING[notation].name}…`;
  rendering.replaceChildren(line);
}

/** An error card, for one cell or the whole slot. */
function errorCard(doc: Document, text: string): HTMLElement {
  const card = doc.createElement('div');
  card.className = `${BASE_CLASS}-error`;
  card.setAttribute('role', 'alert');
  const pre = doc.createElement('pre');
  pre.textContent = text;
  card.append(pre);
  return card;
}

/** An error card in place of every structure. */
export function showError(rendering: HTMLElement, text: string): void {
  rendering.replaceChildren(errorCard(rendering.ownerDocument, text));
}

/** One line's structure, its class and natural width set, or its error card. */
function structure(doc: Document, molecule: MoleculeLine, result: RenderResult, notation: Notation, extra: string | undefined): Element {
  if (result.status !== 'success') return errorCard(doc, describe(result, molecule, notation));
  const svg = parseSvg(doc, result.output);
  if (!svg) return errorCard(doc, `The ${WORDING[notation].name} renderer returned a structure that could not be read`);
  // Every colour gets its dark-theme counterpart; the stylesheet decides which one shows.
  themeStructure(svg);
  // The extra classes, `smarts` and the author's, join the `smiles` class the library put on the root.
  if (extra) svg.setAttribute('class', `${svg.getAttribute('class') ?? ''} ${extra}`.trim());
  // The library leaves the size to the consumer: its SVG carries a viewBox only, in OpenChemLib's
  // pixels. Without a width a small molecule would stretch to the column; the stylesheet still
  // scales a wide one down.
  const width = Number(svg.getAttribute('viewBox')?.trim().split(/[\s,]+/)[2]);
  if (width > 0) svg.setAttribute('width', `${width}px`);
  return svg;
}

/**
 * A single unlabelled molecule stands alone; several, or one with a label, sit side by side in a
 * row with each label beneath its structure.
 */
function row(doc: Document, cells: { molecule: MoleculeLine; node: Element }[]): Element {
  const [only] = cells;
  if (cells.length === 1 && only!.molecule.label === undefined) return only!.node;
  const container = doc.createElement('div');
  container.className = `${BASE_CLASS}-row`;
  for (const { molecule, node } of cells) {
    const cell = doc.createElement('div');
    cell.className = `${BASE_CLASS}-molecule`;
    cell.append(node);
    if (molecule.label !== undefined) {
      const label = doc.createElement('span');
      label.className = `${BASE_CLASS}-label`;
      label.textContent = molecule.label;
      cell.append(label);
    }
    container.append(cell);
  }
  return container;
}

/** Alt text as an accessible name inside the figure, so a caption stays outside the image role. */
function wrap(doc: Document, structures: Element, attributes: FenceAttributes): Element {
  let node = structures;
  if (attributes.alt !== undefined) {
    const image = doc.createElement('div');
    image.setAttribute('role', 'img');
    image.setAttribute('aria-label', attributes.alt);
    image.append(node);
    node = image;
  }
  if (attributes.caption === undefined && attributes.align === undefined) return node;
  const figure = doc.createElement('figure');
  figure.className = attributes.align
    ? `${BASE_CLASS}-figure ${BASE_CLASS}-align-${attributes.align}`
    : `${BASE_CLASS}-figure`;
  figure.append(node);
  if (attributes.caption !== undefined) {
    const caption = doc.createElement('figcaption');
    caption.textContent = attributes.caption;
    figure.append(caption);
  }
  return figure;
}

/** Each line's result in the rendering slot: one structure, or a row of cells, wrapped by the attributes. */
export function showStructures(
  rendering: HTMLElement,
  notation: Notation,
  drawn: { molecule: MoleculeLine; result: RenderResult }[],
  attributes: FenceAttributes
): void {
  const doc = rendering.ownerDocument;
  // A pattern's structure also carries `smarts`, so it can be styled apart from a molecule.
  const extra = [notation === 'smarts' ? 'smarts' : undefined, attributes.class].filter(Boolean).join(' ') || undefined;
  const cells = drawn.map(({ molecule, result }) => ({ molecule, node: structure(doc, molecule, result, notation, extra) }));
  rendering.replaceChildren(wrap(doc, row(doc, cells), attributes));
}

/**
 * Render a fence body into its slot: the empty fence's card without calling the renderer, else
 * every line rendered on its own. A render that throws or rejects becomes that line's report.
 * `live` is asked before the slot is filled, so a block Obsidian has unloaded is left alone.
 */
export async function drawFence(
  rendering: HTMLElement,
  notation: Notation,
  body: string,
  attributes: FenceAttributes,
  render: Render,
  live: () => boolean = () => true
): Promise<void> {
  const molecules = parseMolecules(body);
  if (molecules.length === 0) {
    showError(rendering, `The fence is empty. Write one ${WORDING[notation].line} per line.`);
    return;
  }
  const drawn = await Promise.all(molecules.map(async (molecule) => {
    let result: RenderResult;
    try {
      result = await render({ source: molecule.smiles, notation });
    } catch (error) {
      result = { status: 'failure', message: error instanceof Error ? error.message : String(error) };
    }
    return { molecule, result };
  }));
  if (live()) showStructures(rendering, notation, drawn, attributes);
}
