// The smiles-specific roles written before the shared themeSvg: atom labels as ink, SMARTS
// highlights as areas, small dots as marks, and colours inside an embedded <style>. The SVG below
// is real smiles-renderer output for `[NX3;H2,H1;!$(NC=O)]` in a smarts fence, plus a chlorine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themeStructure, themeStyleText } from '../src/structure-theme';
import { contrast, DARK_PAGE, LINE_CONTRAST, parseColor, TEXT_CONTRAST, type Rgb } from '../src/theme';
import { document } from './helpers';

const OUTPUT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 71" class="smiles" id="p-root">' +
  '<style>#p-root text{font-family:sans-serif}#p-root line{stroke-linecap:round}#p-root polygon{stroke-linejoin:round}</style>' +
  '<svg x="0" y="0" width="108" height="71" viewBox="242 164 108 71">' +
  '<circle cx="300" cy="191" r="16.92" fill="rgb(255,160,255)"/><circle cx="268.82" cy="209" r="16.92" fill="rgb(255,160,255)"/>' +
  '<line x1="300" y1="191" x2="268.82" y2="209" stroke="rgb(255,160,255)" stroke-width="33.84"/>' +
  '<circle cx="300" cy="191" r="7.2" fill="rgb(255,160,0)"/>' +
  '<text x="323.23" y="216.33" stroke="none" font-size="22" fill="rgb(48,80,248)">N</text>' +
  '<text x="269.04" y="207" stroke="none" font-size="15" fill="rgb(48,80,248)">h1-2,pi0</text>' +
  '<text x="260.27" y="216.33" stroke="none" font-size="22" fill="rgb(160,0,64)">O</text>' +
  '<text x="313.39" y="204.67" stroke="none" font-size="14" fill="rgb(31,240,31)">Cl</text>' +
  '<text x="300" y="200" stroke="none" font-size="14" fill="rgb(0,0,0)">?</text>' +
  '<line x1="298.65" y1="188.66" x2="291.72" y2="192.66" stroke="rgb(160,0,64)" stroke-width="2.16"/>' +
  '</svg></svg>';

function themed(): Element {
  const svg = new document.defaultView!.DOMParser().parseFromString(OUTPUT, 'image/svg+xml').documentElement;
  themeStructure(svg);
  return svg;
}

/** The light and dark halves of a `light-dark()` in an element's style. */
function halves(element: Element, property: string): [string, string] {
  const value = new RegExp(`${property}:light-dark\\((.+?), (.+)\\)(?:;|$)`).exec(element.getAttribute('style') ?? '');
  assert.ok(value, `${property} on ${element.outerHTML}`);
  return [value[1]!, value[2]!];
}
const rgb = (value: string): Rgb => value === 'var(--text-normal)' ? { r: 0xda, g: 0xda, b: 0xda } : parseColor(value)!;
const text = (svg: Element, content: string) => [...svg.querySelectorAll('text')].find((one) => one.textContent === content)!;

test('every colour keeps its exact original as the light value', () => {
  const svg = themed();
  assert.deepEqual(halves(text(svg, 'Cl'), 'fill')[0], 'rgb(31,240,31)');
  assert.deepEqual(halves(text(svg, 'N'), 'fill')[0], 'rgb(48,80,248)');
  assert.deepEqual(halves(svg.querySelectorAll('line')[1]!, 'stroke')[0], 'rgb(160,0,64)');
});

test('chlorine and other light atom labels stay light ink on the dark page, not mirrored dark', () => {
  const [, dark] = halves(text(themed(), 'Cl'), 'fill');
  assert.ok(contrast(rgb(dark), DARK_PAGE) >= TEXT_CONTRAST, dark);
  assert.equal(dark, 'rgb(31, 240, 31)');
});

test('black labels become Obsidian\'s text colour, and dark ones are lightened to read', () => {
  const svg = themed();
  assert.equal(halves(text(svg, '?'), 'fill')[1], 'var(--text-normal)');
  for (const label of ['N', 'O']) assert.ok(contrast(rgb(halves(text(svg, label), 'fill')[1]), DARK_PAGE) >= TEXT_CONTRAST, label);
});

test('a SMARTS highlight (discs and the band joining them) goes dark as one area, and its annotations read on it', () => {
  const svg = themed();
  const [discA, discB, dot] = [...svg.querySelectorAll('circle')];
  const band = svg.querySelectorAll('line')[0]!;
  const area = halves(discA!, 'fill')[1];
  assert.equal(halves(discB!, 'fill')[1], area);
  assert.equal(halves(band, 'stroke')[1], area);
  assert.ok(contrast(rgb(area), { r: 0, g: 0, b: 0 }) < 3, `the pale pink goes dark: ${area}`);
  const annotation = rgb(halves(text(svg, 'h1-2,pi0'), 'fill')[1]);
  assert.ok(contrast(annotation, rgb(area)) >= TEXT_CONTRAST, 'annotation on the highlight');
  assert.ok(contrast(annotation, DARK_PAGE) >= TEXT_CONTRAST, 'annotation on the page');
  // The any-bond dot is a mark: it keeps its orange, readable on the page.
  const [, dotDark] = halves(dot!, 'fill');
  assert.ok(contrast(rgb(dotDark), DARK_PAGE) >= LINE_CONTRAST, dotDark);
});

test('bonds are lines of at least 3:1 on the page', () => {
  const [, dark] = halves(themed().querySelectorAll('line')[1]!, 'stroke');
  assert.ok(contrast(rgb(dark), DARK_PAGE) >= LINE_CONTRAST, dark);
});

test('colours in an embedded style sheet get dark counterparts; one without colours is unchanged', () => {
  const plain = '#p-root text{font-family:sans-serif}#p-root line{stroke-linecap:round}';
  assert.equal(themeStyleText(plain), plain);
  assert.equal(themeStyleText('#r text{fill:rgb(0,0,0)}#r line{stroke:#000;stroke-width:2}'),
    '#r text{fill:light-dark(rgb(0,0,0), var(--text-normal))}#r line{stroke:light-dark(#000, var(--text-normal));stroke-width:2}');
  assert.match(themeStyleText('#r rect{fill:#ffffff}'), /^#r rect\{fill:light-dark\(#ffffff, rgb\(30, 30, 30\)\)\}$/);
});
