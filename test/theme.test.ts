// The dark-theme colours (src/theme.ts): parsing, the three mappings, and what themeSvg writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DARK_PAGE, DARK_TEXT, LINE_CONTRAST, TEXT_CONTRAST, areaColor, contrast, fromLab, inkColor, parseColor, readableOn,
  themeSvg, toLab, type Rgb
} from '../src/theme';
import { document } from './helpers';

const rgb = (value: string): Rgb => parseColor(value)!;
const svg = (markup: string): Element => {
  const parsed = new (document.defaultView as unknown as typeof globalThis).DOMParser().parseFromString(markup, 'image/svg+xml');
  return document.importNode(parsed.documentElement, true);
};
/** The dark half of `light-dark(<light>, <dark>)` for one property on one element. */
const darkOf = (element: Element, property: string): string | undefined => {
  const declaration = (element.getAttribute('style') ?? '').split(';').find((part) => part.startsWith(`${property}:`));
  return declaration && /^light-dark\(.*, ((?:rgb\([^)]*\))|var\([^)]*\))\)$/.exec(declaration.slice(property.length + 1))?.[1];
};
const lightOf = (element: Element, property: string): string | undefined => {
  const declaration = (element.getAttribute('style') ?? '').split(';').find((part) => part.startsWith(`${property}:`));
  return declaration && /^light-dark\((.*), (?:rgb\([^)]*\)|var\([^)]*\))\)$/.exec(declaration.slice(property.length + 1))?.[1];
};
const value = (dark: string): Rgb => dark === 'var(--text-normal)' ? DARK_TEXT : rgb(dark);

test('parses the colour forms the six renderers emit, and refuses the rest', () => {
  assert.deepEqual(parseColor('#000'), { r: 0, g: 0, b: 0 });
  assert.deepEqual(parseColor('#f0f4ff'), { r: 240, g: 244, b: 255 });
  assert.deepEqual(parseColor('rgb(148,   0, 211)'), { r: 148, g: 0, b: 211 });
  assert.deepEqual(parseColor('rgb(255,13,13)'), { r: 255, g: 13, b: 13 });
  assert.deepEqual(parseColor('lightyellow'), { r: 255, g: 255, b: 224 });
  assert.deepEqual(parseColor('Black'), { r: 0, g: 0, b: 0 });
  assert.deepEqual(parseColor('rgba(0, 0, 0, 0.5)'), { r: 0, g: 0, b: 0 });
  for (const other of ['none', 'currentColor', 'url(#g)', 'transparent', 'inherit', '#00000000', 'rgba(1,2,3,0)', 'lightgoldenrod', '']) {
    assert.equal(parseColor(other), undefined, other);
  }
});

test('OKLab round-trips sRGB', () => {
  for (const colour of ['#000', '#fff', '#ff0000', '#1e1e1e', 'rgb(148, 0, 211)', '#f0e442']) {
    assert.deepEqual(fromLab(toLab(rgb(colour))), rgb(colour), colour);
  }
});

test('ink keeps its hue and is lightened only as far as needed; near-black becomes the text colour', () => {
  assert.equal(inkColor(rgb('#000'), TEXT_CONTRAST).value, 'var(--text-normal)');
  assert.equal(inkColor(rgb('#333'), LINE_CONTRAST).value, 'var(--text-normal)');
  // Already readable on the dark page: untouched (gnuplot's yellow, CPK chlorine).
  for (const bright of ['rgb(240, 228, 66)', 'rgb(31, 240, 31)', 'rgb(255, 160, 0)']) {
    assert.equal(inkColor(rgb(bright), TEXT_CONTRAST).value, bright);
  }
  // Too dark: lightened to the target, no further, with the hue kept.
  for (const [dark, target] of [['rgb(48, 80, 248)', TEXT_CONTRAST], ['darkgreen', LINE_CONTRAST], ['rgb(160, 0, 0)', TEXT_CONTRAST]] as const) {
    const out = inkColor(rgb(dark), target);
    assert.ok(contrast(out.rgb, DARK_PAGE) >= target, dark);
    assert.ok(contrast(out.rgb, DARK_PAGE) < target + 0.3, `${dark} lightened no further than needed`);
    const [a, b] = [toLab(rgb(dark)), toLab(out.rgb)];
    assert.ok(Math.abs(Math.atan2(a.b, a.a) - Math.atan2(b.b, b.a)) < 0.12, `${dark} keeps its hue`);
  }
});

test('areas mirror their lightness between white and the page, keeping hue', () => {
  assert.ok(contrast(areaColor(rgb('#fff')).rgb, DARK_PAGE) < 1.05, 'white paper becomes the page');
  assert.ok(contrast(areaColor(rgb('#000')).rgb, { r: 255, g: 255, b: 255 }) < 1.05, 'black becomes white');
  const pastel = areaColor(rgb('lightblue')).rgb;
  assert.ok(toLab(pastel).L < 0.45 && pastel.b > pastel.r, 'a pastel blue box becomes a dark blue one');
});

test('readableOn moves lightness the shorter way to reach the target', () => {
  const background = rgb('rgb(180, 200, 180)');
  const out = readableOn(DARK_TEXT, background, TEXT_CONTRAST);
  assert.ok(contrast(out.rgb, background) >= TEXT_CONTRAST);
  assert.ok(toLab(out.rgb).L < toLab(DARK_TEXT).L, 'light text on a light fill goes dark');
  assert.equal(readableOn(DARK_TEXT, DARK_PAGE, TEXT_CONTRAST).rgb, DARK_TEXT);
});

test('themeSvg writes light-dark() with the original as the light value, for attributes and styles', () => {
  const root = svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
    '<path d="M0 0" style="fill:none;stroke-width:2.16;stroke:rgb(0,0,0);"/>' +
    '<rect fill="rgb(240,244,255)" stroke="#000"/><text x="1">box</text><text fill="#ffffff">knockout</text>' +
    '<linearGradient><stop stop-color="orange"/></linearGradient><g stroke="currentColor" color="black"/></svg>');
  themeSvg(root);
  const [path, rect, text, knockout, stop, group] = ['path', 'rect', 'text', 'text:nth-of-type(2)', 'stop', 'g'].map((selector) => root.querySelector(selector)!);
  assert.equal(lightOf(path!, 'stroke'), 'rgb(0,0,0)');
  assert.equal(darkOf(path!, 'stroke'), 'var(--text-normal)');
  assert.match(path!.getAttribute('style')!, /fill:none/, 'other declarations are kept');
  assert.equal(lightOf(rect!, 'fill'), 'rgb(240,244,255)');
  assert.ok(toLab(value(darkOf(rect!, 'fill')!)).L < 0.4, 'the pale box goes dark');
  assert.equal(lightOf(text!, 'fill'), 'black', 'text with no fill was black, and says so');
  assert.equal(darkOf(text!, 'fill'), 'var(--text-normal)');
  assert.ok(toLab(value(darkOf(knockout!, 'fill')!)).L < 0.4, 'white text, drawn on a dark fill, goes dark');
  assert.ok(toLab(value(darkOf(stop!, 'stop-color')!)).L < 0.75, 'a gradient stop is an area');
  assert.equal(darkOf(group!, 'color'), 'var(--text-normal)', 'currentColor follows the color property');
  assert.equal(group!.getAttribute('stroke'), 'currentColor');
  // A second pass changes nothing.
  const once = root.outerHTML;
  themeSvg(root);
  assert.equal(root.outerHTML, once);
});

test('text in a flat drawing still reads on a darkened pastel box', () => {
  const root = svg('<svg xmlns="http://www.w3.org/2000/svg"><path style="fill:rgb(240,244,255);stroke:rgb(51,68,102)"/><text fill="rgb(51,68,102)">parse</text></svg>');
  themeSvg(root);
  const box = value(darkOf(root.querySelector('path')!, 'fill')!);
  const text = value(darkOf(root.querySelector('text')!, 'fill')!);
  assert.ok(contrast(text, box) >= TEXT_CONTRAST, `${JSON.stringify(text)} on ${JSON.stringify(box)}`);
});

test('text in a group reads on the group\'s shape: a dark green node keeps readable text', () => {
  const root = svg('<svg xmlns="http://www.w3.org/2000/svg"><g class="node"><polygon fill="darkgreen" stroke="black"/><text fill="black">a</text></g>' +
    '<g class="node"><polygon fill="lightyellow" stroke="black"/><text>b</text></g></svg>');
  themeSvg(root);
  for (const node of root.querySelectorAll('g')) {
    const fill = value(darkOf(node.querySelector('polygon')!, 'fill')!);
    const text = value(darkOf(node.querySelector('text')!, 'fill')!);
    assert.ok(contrast(fill, text) >= TEXT_CONTRAST, node.outerHTML);
  }
});

test('nothing it cannot read is touched', () => {
  const root = svg('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(#g)" stroke="none"/><circle fill="lightgoldenrod"/></svg>');
  const before = root.outerHTML;
  themeSvg(root);
  assert.equal(root.outerHTML, before);
});

test('coloured light text is ink and keeps its colour; only near-white text is knockout', () => {
  const root = svg('<svg xmlns="http://www.w3.org/2000/svg"><text fill="rgb(31,240,31)">Cl</text><text fill="#fff">w</text></svg>');
  themeSvg(root);
  const [chlorine, white] = [...root.querySelectorAll('text')];
  assert.equal(darkOf(chlorine!, 'fill'), 'rgb(31, 240, 31)');
  assert.ok(toLab(value(darkOf(white!, 'fill')!)).L < 0.4);
});

test('a fill on a group of labels is text: it reaches the text target, not the line one', () => {
  const root = svg('<svg xmlns="http://www.w3.org/2000/svg"><g fill="rgb(0,0,139)"><text>label</text></g><g fill="rgb(0,0,139)"><path d="M0 0"/></g></svg>');
  themeSvg(root);
  const [labels, marks] = [...root.querySelectorAll('g')];
  assert.ok(contrast(value(darkOf(labels!, 'fill')!), DARK_PAGE) >= TEXT_CONTRAST);
  assert.ok(contrast(value(darkOf(marks!, 'fill')!), DARK_PAGE) < TEXT_CONTRAST, 'marks only need the line target');
});

test('a label is checked against a filled area, never against an arrowhead before it', () => {
  const root = svg('<svg xmlns="http://www.w3.org/2000/svg"><g class="edge"><path fill="none" stroke="black"/><polygon fill="black" stroke="black"/><text fill="black">label</text></g></svg>');
  themeSvg(root);
  assert.equal(darkOf(root.querySelector('text')!, 'fill'), 'var(--text-normal)');
});

test('white text on a dark coloured header in its group reads on that header (a Netron operator)', () => {
  const root = svg('<svg xmlns="http://www.w3.org/2000/svg"><g class="node"><title>Relu</title><rect fill="#fff" stroke="#333"/>' +
    '<path fill="rgb(112, 41, 33)" d="M0 0"/><text fill="#fff" stroke="none">Relu</text></g></svg>');
  themeSvg(root);
  const header = value(darkOf(root.querySelector('path')!, 'fill')!);
  const text = value(darkOf(root.querySelector('text')!, 'fill')!);
  assert.ok(contrast(text, header) >= TEXT_CONTRAST, `${JSON.stringify(text)} on ${JSON.stringify(header)}`);
});

test('a colour from a style declaration is also kept as the attribute, for a Chromium without light-dark()', () => {
  const root = svg('<svg xmlns="http://www.w3.org/2000/svg"><path style="fill:none;stroke:rgb(0,0,0)"/><rect fill="#fff"/></svg>');
  themeSvg(root);
  const path = root.querySelector('path')!;
  assert.equal(path.getAttribute('stroke'), 'rgb(0,0,0)');
  assert.equal(path.getAttribute('fill'), null, 'fill:none is not a colour and stays a declaration only');
  assert.equal(root.querySelector('rect')!.getAttribute('fill'), '#fff');
});
