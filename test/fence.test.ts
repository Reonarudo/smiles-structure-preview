// The DOM each smiles and smarts block gets: smiles-markdown-preview's test/markdown.test.ts,
// ported from HTML strings to built nodes, with every behavioural expectation kept. Tests about
// delegating other fences, VS Code's scroll sync (code-line, data-line) and its highlighter are
// gone with the markdown-it rule: Obsidian routes blocks by language itself, and the source view
// is the plain body. Escaping tests become "stays text" tests: nothing from the note is parsed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RenderResult } from '@reonarudo/smiles-renderer';
import { buildFence, fenceKey, isSourceView, setView, showError, showLoading } from '../src/fence';
import { document, fence, rendering } from './helpers';

/** The shape of the library's root: a viewBox, its class and its id, no size. */
const svg = (inner = '', width = 75) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 36" class="smiles" id="smiles-0000abcd-root">${inner}</svg>`;
/** The same root once in the slot: its natural width appended as an attribute. */
const sized = (inner = '', width = 75, cls = 'smiles') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 36" class="${cls}" id="smiles-0000abcd-root" width="${width}px">${inner}</svg>`;
/** A text the library drew in the default black, once it has its dark-theme colour. */
const themed = (text: string) => `<text style="fill:light-dark(black, var(--text-normal))">${text}</text>`;
const structure = (output = svg()): RenderResult => ({ status: 'success', output, notes: [] });

const LUCIDE = 'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICON_CODE = `<svg ${LUCIDE} class="svg-icon lucide-code-2 smiles-icon-code">` +
  '<path d="m18 16 4-4-4-4"></path><path d="m6 8-4 4 4 4"></path><path d="m14.5 4-5 16"></path></svg>';
const ICON_GRAPH = `<svg ${LUCIDE} class="svg-icon lucide-network smiles-icon-graph">` +
  '<rect x="16" y="16" width="6" height="6" rx="1"></rect><rect x="2" y="16" width="6" height="6" rx="1"></rect><rect x="9" y="2" width="6" height="6" rx="1"></rect>' +
  '<path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"></path><path d="M12 12V8"></path></svg>';
const TOGGLE = `<button type="button" class="smiles-toggle clickable-icon" aria-pressed="false" aria-label="Show source">${ICON_CODE}${ICON_GRAPH}</button>`;

test('renders smiles fences line by line, passing the bare SMILES string through', async () => {
  let seen: unknown;
  const wrapper = await fence('smiles', 'CC(=O)O acetic acid', (input) => { seen = input; return structure(); });
  assert.match(rendering(wrapper), /<svg/);
  assert.deepEqual(seen, { source: 'CC(=O)O', notation: 'smiles' });
});

test('renders smarts fences, each line on its own, in the fence\'s notation', async () => {
  const seen: [string, string][] = [];
  const render = ({ source, notation }: { source: string; notation: string }) => { seen.push([source, notation]); return structure(); };
  await fence('smarts', '[#6][OX2H] alcohol\n  [#7]', render);
  await fence('smiles', 'CCO', render);
  assert.deepEqual(seen, [['[#6][OX2H]', 'smarts'], ['[#7]', 'smarts'], ['CCO', 'smiles']]);
});

test('the structure gets its natural width in pixels from the viewBox', async () => {
  assert.equal(rendering(await fence('smiles', 'c1ccccc1', () => structure(svg('', 58.5)))), sized('', 58.5));
});

test('a pattern carries the smarts class beside the base class and the author\'s', async () => {
  const cls = async (info: string) => (await fence(info, info.startsWith('smarts') ? '[#6]' : 'C', () => structure()))
    .querySelector('.smiles-rendering svg')!.getAttribute('class');
  assert.equal(await cls('smarts'), 'smiles smarts');
  assert.equal(await cls('smarts {class="wide"}'), 'smiles smarts wide');
  assert.equal(await cls('smiles'), 'smiles');
});

test('smarts fences take the same attributes, and report in their own words', async () => {
  const timeout = await fence('smarts {caption="Carboxylic acid"}', '[CX3](=O)[OX2H1]', () => ({ status: 'timeout', budget: 3000 }));
  assert.match(rendering(timeout), /Shorten the SMARTS pattern, split the pattern, or raise the limit\.[\s\S]*<figcaption>Carboxylic acid<\/figcaption>/);
  assert.match(rendering(await fence('smarts', '', () => structure())), /The fence is empty\. Write one SMARTS pattern per line\./);
  assert.match(rendering(await fence('smarts', '[#6]', () => ({ status: 'unavailable', reason: 'x' }))), /The SMARTS renderer could not start/);
});

// The DOM contract, asserted exactly once, here.
test('every block is wrapped: toggle first, rendering slot, then the source <pre>', async () => {
  assert.equal((await fence('smiles', 'CCO', () => structure())).outerHTML,
    `<div class="smiles-fence" data-fence-key="${fenceKey('CCO')}">${TOGGLE}` +
    `<div class="smiles-rendering">${sized()}</div>` +
    '<pre><code class="language-smiles">CCO</code></pre></div>');
  // A smarts block's source view carries its own word.
  assert.match((await fence('smarts', '[#6]', () => structure())).outerHTML,
    /^<div class="smiles-fence" data-fence-key="[0-9a-f]{8}"><button type="button" class="smiles-toggle clickable-icon"[\s\S]*<\/div><pre><code class="language-smarts">\[#6\]<\/code><\/pre><\/div>$/);
});

test('the fence key is FNV-1a of the exact body', () => {
  // VS Code's fence body ends with the closing newline; Obsidian hands the processor the body
  // without it, so the plugin keys `CCO` where the extension keyed `CCO\n` (78d3e18a).
  assert.equal(fenceKey('CCO\n'), '78d3e18a');
  assert.equal(fenceKey(''), '811c9dc5');
  assert.equal(fenceKey('CCO \n'), 'fdc287d2');
});

test('the info string and the notation play no part in the key', async () => {
  const keys = await Promise.all(['smiles', 'smiles {caption="c"}', 'smarts'].map(async (info) =>
    (await fence(info, 'CCO', () => structure())).getAttribute('data-fence-key')));
  assert.deepEqual(keys, [fenceKey('CCO'), fenceKey('CCO'), fenceKey('CCO')]);
});

test('the source view is the body as text, never markup', async () => {
  const wrapper = await fence('smiles', 'CCO <b>x</b>\n<img src=x onerror=alert(1)>', () => structure());
  assert.equal(wrapper.querySelector(':scope > pre > code')!.textContent, 'CCO <b>x</b>\n<img src=x onerror=alert(1)>');
  assert.equal(wrapper.querySelectorAll('img, b').length, 0);
});

test('setView flips the wrapper, the button state and its name, and back', async () => {
  const wrapper = await fence('smiles', 'CCO', () => structure());
  const button = wrapper.querySelector('button')!;
  setView(wrapper, true);
  assert.equal(wrapper.getAttribute('data-view'), 'source');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(button.getAttribute('aria-label'), 'Show structure');
  assert.equal(isSourceView(wrapper), true);
  setView(wrapper, false);
  assert.equal(wrapper.hasAttribute('data-view'), false);
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(button.getAttribute('aria-label'), 'Show source');
});

test('the loading line and error cards sit in the rendering slot', () => {
  const parts = buildFence(document, 'CCO', fenceKey('CCO'), 'smiles');
  showLoading(parts.rendering, 'smiles');
  assert.equal(rendering(parts.wrapper), '<p class="smiles-loading" role="status">Rendering SMILES…</p>');
  showError(parts.rendering, 'x');
  assert.equal(rendering(parts.wrapper), '<div class="smiles-error" role="alert"><pre>x</pre></div>');
});

test('a multi-line fence is one wrapper: the row and its per-cell error card sit in the rendering slot', async () => {
  const wrapper = await fence('smiles', 'CCO\nbad\nCCC', ({ source }) => source === 'bad'
    ? { status: 'failure', message: 'no', line: 1, column: 1 }
    : structure());
  assert.equal(wrapper.querySelectorAll('button').length, 1);
  assert.equal(rendering(wrapper),
    `<div class="smiles-row"><div class="smiles-molecule">${sized()}</div>` +
    '<div class="smiles-molecule"><div class="smiles-error" role="alert"><pre>no at line 2, column 1\n\nbad\n^</pre></div></div>' +
    `<div class="smiles-molecule">${sized()}</div></div>`);
  assert.equal(wrapper.querySelector(':scope > pre > code')!.textContent, 'CCO\nbad\nCCC');
});

test('the empty-fence error card gets the wrapper, with an empty source view, and the renderer is not called', async () => {
  const wrapper = await fence('smiles', '', () => { throw new Error('must not render'); });
  assert.equal(wrapper.outerHTML,
    `<div class="smiles-fence" data-fence-key="811c9dc5">${TOGGLE}` +
    '<div class="smiles-rendering"><div class="smiles-error" role="alert"><pre>The fence is empty. Write one SMILES string per line.</pre></div></div>' +
    '<pre><code class="language-smiles"></code></pre></div>');
  // Blank lines are no molecules either, and attributes do not wrap the empty card.
  assert.equal(rendering(await fence('smiles {caption="c"}', '\n  \n', () => { throw new Error('must not render'); })),
    '<div class="smiles-error" role="alert"><pre>The fence is empty. Write one SMILES string per line.</pre></div>');
});

test('alt becomes an accessible name, caption a figure, align a class', async () => {
  const html = rendering(await fence('smiles {alt="Ethanol" caption="Figure 1" align="center"}', 'CCO', () => structure()));
  // The caption sits outside the image role to stay readable by assistive technology.
  assert.equal(html, `<figure class="smiles-figure smiles-align-center"><div role="img" aria-label="Ethanol">${sized()}</div><figcaption>Figure 1</figcaption></figure>`);
});

test('align alone still produces a figure to carry the class', async () => {
  assert.equal(rendering(await fence('smiles {align="right"}', 'CCO', () => structure())),
    `<figure class="smiles-figure smiles-align-right">${sized()}</figure>`);
});

test('class lands on the root svg beside the base class, as text', async () => {
  const wrapper = await fence('smiles {class="wide &quot;x\\" onload=\\"y"}', 'CCO', () => structure(svg('<g class="smiles"></g>')));
  const root = wrapper.querySelector('.smiles-rendering > svg')!;
  assert.equal(root.getAttribute('class'), 'smiles wide &quot;x" onload="y');
  assert.equal(root.getAttribute('onload'), null);
  assert.equal(root.querySelector('g')!.getAttribute('class'), 'smiles');
});

test('attribute and label text stays text, including quotes, markup and Markdown', async () => {
  const wrapper = await fence('smiles {alt="<img src=x onerror=alert(1)>" caption="**bold** & \\"quoted\\""}', 'CCO <b>bold</b>', () => structure());
  assert.equal(wrapper.querySelectorAll('img, b, strong').length, 0);
  assert.equal(wrapper.querySelector('[role="img"]')!.getAttribute('aria-label'), '<img src=x onerror=alert(1)>');
  assert.equal(wrapper.querySelector('figcaption')!.textContent, '**bold** & "quoted"');
  assert.equal(wrapper.querySelector('.smiles-label')!.textContent, '<b>bold</b>');
});

test('malformed attributes are ignored and the structure still renders bare', async () => {
  assert.equal(rendering(await fence('smiles {alt="unterminated}', 'CCO', () => structure())), sized());
});

test('several lines become a row of molecules, each label beneath its structure', async () => {
  const html = rendering(await fence('smiles', 'CCO ethanol\nCCC', ({ source }) => structure(svg(`<text>${source}</text>`))));
  assert.equal(html,
    `<div class="smiles-row"><div class="smiles-molecule">${sized(themed('CCO'))}<span class="smiles-label">ethanol</span></div>` +
    `<div class="smiles-molecule">${sized(themed('CCC'))}</div></div>`);
});

test('one labelled molecule is also a row, so the label sits beneath it', async () => {
  assert.equal(rendering(await fence('smiles', 'CCO ethanol', () => structure())),
    `<div class="smiles-row"><div class="smiles-molecule">${sized()}<span class="smiles-label">ethanol</span></div></div>`);
});

test('a failure names the fence line and column, and quotes the string with a caret', async () => {
  const wrapper = await fence('smiles', 'CCO\n  C1CC', () => ({ status: 'failure', message: 'dangling ring closure: 1', line: 1, column: 5 }));
  assert.match(rendering(wrapper), /<div class="smiles-error" role="alert"><pre>dangling ring closure: 1 at line 2, column 7\n\nC1CC\n {4}\^<\/pre><\/div>/);
});

test('a failure without a column names the line and quotes the string without a caret, as text', async () => {
  const wrapper = await fence('smiles', 'CCO', () => ({ status: 'failure', message: '<b>No atoms found.</b>', line: 1 }));
  assert.equal(wrapper.querySelector('.smiles-error pre')!.textContent, '<b>No atoms found.</b> at line 1\n\nCCO');
  assert.equal(wrapper.querySelectorAll('.smiles-rendering b').length, 0);
});

test('a throwing or rejecting renderer becomes that line\'s report', async () => {
  const thrown = await fence('smiles', 'CCO', () => { throw new Error('render after dispose'); });
  assert.equal(thrown.querySelector('.smiles-error pre')!.textContent, 'render after dispose at line 1\n\nCCO');
  const rejected = await fence('smiles', 'CCO', () => Promise.reject(new Error('gone')));
  assert.equal(rejected.querySelector('.smiles-error pre')!.textContent, 'gone at line 1\n\nCCO');
});

test('a broken line in a row shows its report while the others still render', async () => {
  const wrapper = await fence('smiles', 'CCO\nbad\nCCC', ({ source }) => source === 'bad'
    ? { status: 'failure', message: 'unknown element label found', line: 1, column: 1 }
    : structure());
  // Counted in the rendering slot: the toggle's two glyphs are SVGs too.
  assert.equal(wrapper.querySelectorAll('.smiles-rendering svg').length, 2);
  assert.match(rendering(wrapper), /<div class="smiles-molecule"><div class="smiles-error" role="alert"><pre>unknown element label found at line 2, column 1\n\nbad\n\^<\/pre><\/div><\/div>/);
});

test('a timeout and an unavailable renderer have fixed wording', async () => {
  const text = async (result: RenderResult) => (await fence('smiles', 'CCO', () => result)).querySelector('.smiles-error pre')!.textContent;
  assert.equal(await text({ status: 'timeout', budget: 3000 }),
    'Depiction took longer than 3 s (the Depiction timeout setting). Shorten the SMILES string, split the molecule, or raise the limit.');
  assert.match((await text({ status: 'timeout', budget: 1500 }))!, /longer than 1\.5 s/);
  assert.equal(await text({ status: 'unavailable', reason: 'out of <memory>' }),
    'The SMILES renderer could not start: out of <memory>. It will retry on the next render.');
});

test('output that is not a well-formed <svg> becomes that cell\'s error card, not markup', async () => {
  for (const output of ['<img src=x onerror=alert(1)>', '<svg><unclosed></svg>', 'plain text', '<html><body/></html>']) {
    const wrapper = await fence('smiles', 'CCO', () => ({ status: 'success', output, notes: [] }));
    assert.equal(rendering(wrapper), '<div class="smiles-error" role="alert"><pre>The SMILES renderer returned a structure that could not be read</pre></div>', output);
  }
});

test('a structure without a viewBox gets no width', async () => {
  const wrapper = await fence('smiles', 'CCO', () => structure('<svg xmlns="http://www.w3.org/2000/svg" class="smiles"></svg>'));
  assert.equal(wrapper.querySelector('.smiles-rendering > svg')!.hasAttribute('width'), false);
});
