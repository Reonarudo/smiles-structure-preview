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

/**
 * The wrapper with its toggle, an empty rendering slot, and the source view in the fence's own
 * word, built inside `parent` (the element Obsidian hands the code block processor) with
 * Obsidian's `createEl`, so every element belongs to the window the block is drawn in, pop-out
 * windows included.
 */
export function buildFence(parent: HTMLElement, body: string, key: string, notation: Notation): FenceParts {
  const wrapper = parent.createDiv({ cls: `${BASE_CLASS}-fence`, attr: { 'data-fence-key': key } });
  // `clickable-icon` is Obsidian's own icon-button class, so the button takes the app's look.
  const button = wrapper.createEl('button', {
    cls: `${BASE_CLASS}-toggle clickable-icon`,
    attr: { type: 'button', 'aria-pressed': 'false', 'aria-label': LABEL_SHOW_SOURCE }
  });
  for (const icon of [ICON_CODE, ICON_GRAPH]) button.append(parseSvg(wrapper.doc, icon)!);
  const rendering = wrapper.createDiv({ cls: `${BASE_CLASS}-rendering` });
  wrapper.createEl('pre').createEl('code', { cls: `language-${notation}`, text: body });
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
  rendering.empty();
  rendering.createEl('p', { cls: `${BASE_CLASS}-loading`, attr: { role: 'status' }, text: `Rendering ${WORDING[notation].name}…` });
}

/** An error card at the end of `parent`: for one cell, or the whole slot. */
function errorCard(parent: HTMLElement, text: string): void {
  parent.createDiv({ cls: `${BASE_CLASS}-error`, attr: { role: 'alert' } }).createEl('pre', { text });
}

/** An error card in place of every structure. */
export function showError(rendering: HTMLElement, text: string): void {
  rendering.empty();
  errorCard(rendering, text);
}

/** One line's structure, its class and natural width set, or its error card, appended to `parent`. */
function structure(parent: HTMLElement, molecule: MoleculeLine, result: RenderResult, notation: Notation, extra: string | undefined): void {
  if (result.status !== 'success') {
    errorCard(parent, describe(result, molecule, notation));
    return;
  }
  const svg = parseSvg(parent.doc, result.output);
  if (!svg) {
    errorCard(parent, `The ${WORDING[notation].name} renderer returned a structure that could not be read`);
    return;
  }
  // Every colour gets its dark-theme counterpart; the stylesheet decides which one shows.
  themeStructure(svg);
  // The extra classes, `smarts` and the author's, join the `smiles` class the library put on the root.
  if (extra) svg.setAttribute('class', `${svg.getAttribute('class') ?? ''} ${extra}`.trim());
  // The library leaves the size to the consumer: its SVG carries a viewBox only, in OpenChemLib's
  // pixels. Without a width a small molecule would stretch to the column; the stylesheet still
  // scales a wide one down.
  const width = Number(svg.getAttribute('viewBox')?.trim().split(/[\s,]+/)[2]);
  if (width > 0) svg.setAttribute('width', `${width}px`);
  parent.append(svg);
}

/**
 * Each line's result in the rendering slot. A single unlabelled molecule stands alone; several, or
 * one with a label, sit side by side in a row with each label beneath its structure. Captioned or
 * aligned structures go in a figure, with the alt text as an accessible name inside it, so a
 * caption stays outside the image role.
 */
export function showStructures(
  rendering: HTMLElement,
  notation: Notation,
  drawn: { molecule: MoleculeLine; result: RenderResult }[],
  attributes: FenceAttributes
): void {
  // A pattern's structure also carries `smarts`, so it can be styled apart from a molecule.
  const extra = [notation === 'smarts' ? 'smarts' : undefined, attributes.class].filter(Boolean).join(' ') || undefined;
  rendering.empty();
  const figure = attributes.caption === undefined && attributes.align === undefined
    ? rendering
    : rendering.createEl('figure', {
      cls: attributes.align ? `${BASE_CLASS}-figure ${BASE_CLASS}-align-${attributes.align}` : `${BASE_CLASS}-figure`
    });
  const holder = attributes.alt === undefined ? figure : figure.createDiv({ attr: { role: 'img', 'aria-label': attributes.alt } });
  const [only] = drawn;
  if (drawn.length === 1 && only!.molecule.label === undefined) {
    structure(holder, only!.molecule, only!.result, notation, extra);
  } else {
    const row = holder.createDiv({ cls: `${BASE_CLASS}-row` });
    for (const { molecule, result } of drawn) {
      const cell = row.createDiv({ cls: `${BASE_CLASS}-molecule` });
      structure(cell, molecule, result, notation, extra);
      if (molecule.label !== undefined) cell.createSpan({ cls: `${BASE_CLASS}-label`, text: molecule.label });
    }
  }
  if (attributes.caption !== undefined) figure.createEl('figcaption', { text: attributes.caption });
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
