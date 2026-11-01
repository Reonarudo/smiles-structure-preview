/**
 * Dark-theme colours for a rendered drawing, as Mermaid diagrams follow Obsidian's theme
 * (docs/adr/0002-dark-theme-colours.md). Every colour in the SVG gets a role and a dark
 * counterpart, written as `light-dark(<original>, <dark>)`, so the drawing switches with the
 * theme without being drawn again. The light value is always the renderer's original text.
 *
 * Roles:
 * - ink: strokes, the `color` property, dark marks (filled arrowheads, dots, glyphs) and dark
 *   text. Hue and chroma are kept and lightness is raised only as far as needed to read on the
 *   dark page; near-black greys become Obsidian's own text colour.
 * - area: fills that light-mode text sits on (paper, pastel boxes, highlights, gradient stops).
 *   Lightness is mirrored between the page and white, hue kept: white becomes the page.
 * - knockout text: near-white text, which in a light drawing sits on a dark fill; it is mirrored
 *   like an area, so it stays opposite its (also mirrored) fill. Coloured light text (a bright
 *   green atom label) is ink, and already reads on the page.
 * A fill set on a container that holds text (a group colouring its labels) counts as text.
 * Text inside a group with a filled shape is then checked against that shape's dark fill;
 * near-black marks such as arrowheads are not something text sits on.
 *
 * Where a colour was set in a style declaration, the original is also written as the presentation
 * attribute: a Chromium without `light-dark()` drops the whole declaration, and the attribute then
 * draws the original colour (the stylesheet keeps the white card there).
 *
 * Pure apart from the DOM it is given; it never reads layout, so it runs the same in tests.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Lab {
  L: number;
  a: number;
  b: number;
}

/** Obsidian's default dark `--background-primary`, the page the dark colours are measured against. */
export const DARK_PAGE: Rgb = { r: 0x1e, g: 0x1e, b: 0x1e };
/** Obsidian's default dark `--text-normal`, what near-black ink becomes. */
export const DARK_TEXT: Rgb = { r: 0xda, g: 0xda, b: 0xda };
const DARK_TEXT_VALUE = 'var(--text-normal)';

/** WCAG contrast targets: text, and lines and marks. */
export const TEXT_CONTRAST = 4.5;
export const LINE_CONTRAST = 3;
/**
 * What text is lightened to against the page: a margin over 4.5, so text that sits on a pale box
 * in a flat drawing (no group to check it against) still reads once that box is darkened, since
 * a darkened pastel comes out a little lighter than the page.
 */
export const TEXT_ON_PAGE = 5;

// ---- Parsing ----

const NAMED: Record<string, string> = {
  aliceblue: 'f0f8ff', antiquewhite: 'faebd7', aqua: '00ffff', aquamarine: '7fffd4', azure: 'f0ffff', beige: 'f5f5dc',
  bisque: 'ffe4c4', black: '000000', blanchedalmond: 'ffebcd', blue: '0000ff', blueviolet: '8a2be2', brown: 'a52a2a',
  burlywood: 'deb887', cadetblue: '5f9ea0', chartreuse: '7fff00', chocolate: 'd2691e', coral: 'ff7f50',
  cornflowerblue: '6495ed', cornsilk: 'fff8dc', crimson: 'dc143c', cyan: '00ffff', darkblue: '00008b', darkcyan: '008b8b',
  darkgoldenrod: 'b8860b', darkgray: 'a9a9a9', darkgreen: '006400', darkgrey: 'a9a9a9', darkkhaki: 'bdb76b',
  darkmagenta: '8b008b', darkolivegreen: '556b2f', darkorange: 'ff8c00', darkorchid: '9932cc', darkred: '8b0000',
  darksalmon: 'e9967a', darkseagreen: '8fbc8f', darkslateblue: '483d8b', darkslategray: '2f4f4f', darkslategrey: '2f4f4f',
  darkturquoise: '00ced1', darkviolet: '9400d3', deeppink: 'ff1493', deepskyblue: '00bfff', dimgray: '696969',
  dimgrey: '696969', dodgerblue: '1e90ff', firebrick: 'b22222', floralwhite: 'fffaf0', forestgreen: '228b22',
  fuchsia: 'ff00ff', gainsboro: 'dcdcdc', ghostwhite: 'f8f8ff', gold: 'ffd700', goldenrod: 'daa520', gray: '808080',
  green: '008000', greenyellow: 'adff2f', grey: '808080', honeydew: 'f0fff0', hotpink: 'ff69b4', indianred: 'cd5c5c',
  indigo: '4b0082', ivory: 'fffff0', khaki: 'f0e68c', lavender: 'e6e6fa', lavenderblush: 'fff0f5', lawngreen: '7cfc00',
  lemonchiffon: 'fffacd', lightblue: 'add8e6', lightcoral: 'f08080', lightcyan: 'e0ffff', lightgoldenrodyellow: 'fafad2',
  lightgray: 'd3d3d3', lightgreen: '90ee90', lightgrey: 'd3d3d3', lightpink: 'ffb6c1', lightsalmon: 'ffa07a',
  lightseagreen: '20b2aa', lightskyblue: '87cefa', lightslategray: '778899', lightslategrey: '778899',
  lightsteelblue: 'b0c4de', lightyellow: 'ffffe0', lime: '00ff00', limegreen: '32cd32', linen: 'faf0e6', magenta: 'ff00ff',
  maroon: '800000', mediumaquamarine: '66cdaa', mediumblue: '0000cd', mediumorchid: 'ba55d3', mediumpurple: '9370db',
  mediumseagreen: '3cb371', mediumslateblue: '7b68ee', mediumspringgreen: '00fa9a', mediumturquoise: '48d1cc',
  mediumvioletred: 'c71585', midnightblue: '191970', mintcream: 'f5fffa', mistyrose: 'ffe4e1', moccasin: 'ffe4b5',
  navajowhite: 'ffdead', navy: '000080', oldlace: 'fdf5e6', olive: '808000', olivedrab: '6b8e23', orange: 'ffa500',
  orangered: 'ff4500', orchid: 'da70d6', palegoldenrod: 'eee8aa', palegreen: '98fb98', paleturquoise: 'afeeee',
  palevioletred: 'db7093', papayawhip: 'ffefd5', peachpuff: 'ffdab9', peru: 'cd853f', pink: 'ffc0cb', plum: 'dda0dd',
  powderblue: 'b0e0e6', purple: '800080', rebeccapurple: '663399', red: 'ff0000', rosybrown: 'bc8f8f',
  royalblue: '4169e1', saddlebrown: '8b4513', salmon: 'fa8072', sandybrown: 'f4a460', seagreen: '2e8b57',
  seashell: 'fff5ee', sienna: 'a0522d', silver: 'c0c0c0', skyblue: '87ceeb', slateblue: '6a5acd', slategray: '708090',
  slategrey: '708090', snow: 'fffafa', springgreen: '00ff7f', steelblue: '4682b4', tan: 'd2b48c', teal: '008080',
  thistle: 'd8bfd8', tomato: 'ff6347', turquoise: '40e0d0', violet: 'ee82ee', wheat: 'f5deb3', white: 'ffffff',
  whitesmoke: 'f5f5f5', yellow: 'ffff00', yellowgreen: '9acd32'
};

/** An opaque sRGB colour from a CSS colour value, or nothing for keywords, references and anything unknown. */
export function parseColor(value: string): Rgb | undefined {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)?.[1] ?? NAMED[text];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex;
    if (full.length === 8 && full.slice(6) === '00') return undefined;
    return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
  }
  const rgb = /^rgba?\(\s*([\d.]+)(%?)\s*[,\s]\s*([\d.]+)(%?)\s*[,\s]\s*([\d.]+)(%?)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(text);
  if (!rgb) return undefined;
  if (rgb[7] !== undefined && parseFloat(rgb[7]) === 0) return undefined;
  const channel = (n: string, percent: string) => Math.round(Math.min(255, Math.max(0, percent ? parseFloat(n) * 2.55 : parseFloat(n))));
  return { r: channel(rgb[1]!, rgb[2]!), g: channel(rgb[3]!, rgb[4]!), b: channel(rgb[5]!, rgb[6]!) };
}

export function formatColor({ r, g, b }: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

// ---- Colour science: sRGB, OKLab (Björn Ottosson), WCAG luminance ----

const toLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number): number => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function toLab({ r, g, b }: Rgb): Lab {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  };
}

/** Linear sRGB channels of an OKLab colour; out of gamut when any is outside [0, 1]. */
function labToLinear({ L, a, b }: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
}

/** The OKLab colour as sRGB, chroma reduced (hue kept) until it fits the gamut. */
export function fromLab(lab: Lab): Rgb {
  const L = Math.min(1, Math.max(0, lab.L));
  const fits = (k: number) => labToLinear({ L, a: lab.a * k, b: lab.b * k }).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  let k = 1;
  if (!fits(1)) {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (fits(mid)) low = mid;
      else high = mid;
    }
    k = low;
  }
  const channels = labToLinear({ L, a: lab.a * k, b: lab.b * k })
    .map((v) => Math.round(Math.min(255, Math.max(0, fromLinear(Math.min(1, Math.max(0, v)))))));
  return { r: channels[0]!, g: channels[1]!, b: channels[2]! };
}

export function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrast(x: Rgb, y: Rgb): number {
  const [a, b] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (a! + 0.05) / (b! + 0.05);
}

const chroma = (lab: Lab): number => Math.hypot(lab.a, lab.b);

// ---- The three mappings ----

/** A dark value: a colour, or Obsidian's text colour (with the colour it stands for, for contrast). */
interface Dark {
  value: string;
  rgb: Rgb;
}

const PAGE_L = toLab(DARK_PAGE).L;

/** Lines, marks and dark text: hue kept, lightness raised only until `target` contrast with the page. */
export function inkColor(rgb: Rgb, target: number): Dark {
  const lab = toLab(rgb);
  if (chroma(lab) < 0.02 && lab.L < 0.5) return { value: DARK_TEXT_VALUE, rgb: DARK_TEXT };
  if (contrast(rgb, DARK_PAGE) >= target) return { value: formatColor(rgb), rgb };
  let low = lab.L;
  let high = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (contrast(fromLab({ ...lab, L: mid }), DARK_PAGE) >= target) high = mid;
    else low = mid;
  }
  const out = fromLab({ ...lab, L: high });
  return { value: formatColor(out), rgb: out };
}

/** Areas: lightness mirrored between white and the page (white becomes the page, black white), hue kept. */
export function areaColor(rgb: Rgb): Dark {
  const lab = toLab(rgb);
  const out = fromLab({ ...lab, L: 1 - lab.L * (1 - PAGE_L) });
  return { value: formatColor(out), rgb: out };
}

/** The lightness of `text` that gives at least `target` contrast on `background`, as close to its own as possible. */
export function readableOn(text: Rgb, background: Rgb, target: number): Dark {
  if (contrast(text, background) >= target) return { value: formatColor(text), rgb: text };
  const lab = toLab(text);
  const candidates: Rgb[] = [];
  for (let step = 1; step <= 100; step++) {
    for (const L of [lab.L + step / 100, lab.L - step / 100]) {
      if (L < 0 || L > 1) continue;
      const rgb = fromLab({ ...lab, L });
      if (contrast(rgb, background) >= target) candidates.push(rgb);
    }
    if (candidates.length) break;
  }
  const best = candidates[0] ?? (contrast({ r: 255, g: 255, b: 255 }, background) > contrast({ r: 0, g: 0, b: 0 }, background)
    ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 });
  return { value: formatColor(best), rgb: best };
}

// ---- Applying it to an SVG ----

const PROPERTIES = ['fill', 'stroke', 'stop-color', 'flood-color', 'color'] as const;
type Property = typeof PROPERTIES[number];
const TEXT = new Set(['text', 'tspan', 'textPath']);
const CONTAINERS = new Set(['svg', 'g', 'a', 'symbol', 'switch']);
/** Text lighter than this, and nearly grey, is knockout text drawn on a dark fill. */
const KNOCKOUT_L = 0.75;
const KNOCKOUT_CHROMA = 0.05;
const SHAPES = new Set(['rect', 'circle', 'ellipse', 'polygon', 'path']);

function declarations(element: Element): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of (element.getAttribute('style') ?? '').split(';')) {
    const colon = part.indexOf(':');
    if (colon > 0) map.set(part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).trim());
  }
  return map;
}

function writeStyle(element: Element, map: Map<string, string>): void {
  element.setAttribute('style', [...map].map(([name, value]) => `${name}:${value}`).join(';'));
}

/** The value a property has on this element itself: its style declaration, else its attribute. */
function own(element: Element, property: Property, style: Map<string, string>): string | undefined {
  return style.get(property) ?? element.getAttribute(property) ?? undefined;
}

/** Whether this element or an ancestor inside `root` sets a fill. */
function inheritsFill(element: Element, root: Element): boolean {
  for (let node = element.parentElement; node && node !== root.parentElement; node = node.parentElement) {
    if (own(node, 'fill', declarations(node)) !== undefined) return true;
  }
  return false;
}

type Role = 'ink' | 'text' | 'area';

function roleOf(element: Element, property: Property, rgb: Rgb): Role {
  const name = element.localName;
  if (property === 'stop-color' || property === 'flood-color') return 'area';
  const lab = toLab(rgb);
  const holdsText = TEXT.has(name) || (CONTAINERS.has(name) && element.querySelector('text') !== null);
  if (property === 'stroke') return 'ink';
  if (property === 'color') return holdsText ? 'text' : 'ink';
  // fill
  if (holdsText) return lab.L >= KNOCKOUT_L && chroma(lab) < KNOCKOUT_CHROMA ? 'area' : 'text';
  return lab.L < 0.4 ? 'ink' : 'area';
}

function darkFor(role: Role, rgb: Rgb): Dark {
  if (role === 'area') return areaColor(rgb);
  return inkColor(rgb, role === 'text' ? TEXT_ON_PAGE : LINE_CONTRAST);
}

/**
 * Give every colour in `svg` a dark-theme counterpart through `light-dark()`. Which one shows is
 * decided by the drawing's `color-scheme`, set by the plugin's stylesheet.
 */
export function themeSvg(svg: Element): void {
  const darkFill = new Map<Element, Rgb>();
  const darkText = new Map<Element, { style: Map<string, string>; original: string; rgb: Rgb }>();
  for (const element of [svg, ...svg.querySelectorAll('*')]) {
    const style = declarations(element);
    let changed = false;
    for (const property of PROPERTIES) {
      const fromStyle = style.has(property);
      let original = own(element, property, style);
      // Text, and shapes nothing gives a fill, are drawn in the SVG default: black.
      if (original === undefined && property === 'fill' && (TEXT.has(element.localName) || SHAPES.has(element.localName)) && !inheritsFill(element, svg)) {
        if (TEXT.has(element.localName) || element.localName === 'path') original = 'black';
      }
      if (original === undefined || original.startsWith('light-dark(')) continue;
      const rgb = parseColor(original);
      if (!rgb) continue;
      const role = roleOf(element, property, rgb);
      const dark = darkFor(role, rgb);
      style.set(property, `light-dark(${original}, ${dark.value})`);
      if (fromStyle) element.setAttribute(property, original);
      changed = true;
      // Anything filled can be what a label sits on, except near-black marks (arrowheads, dots),
      // which become the text colour themselves.
      if (property === 'fill' && SHAPES.has(element.localName) && dark.value !== DARK_TEXT_VALUE) darkFill.set(element, dark.rgb);
      if (property === 'fill' && TEXT.has(element.localName)) darkText.set(element, { style, original, rgb: dark.rgb });
    }
    if (changed) writeStyle(element, style);
  }
  // Text in a group that also holds a filled shape (a node's box, an operator's header) must read
  // on that shape, not only on the page. A flat drawing has no such groups, and is left alone.
  for (const [text, { style, original, rgb }] of darkText) {
    const group = text.parentElement;
    if (!group || group === svg) continue;
    let fill: Rgb | undefined;
    for (const sibling of group.children) {
      if (sibling === text) break;
      fill = darkFill.get(sibling) ?? fill;
    }
    if (!fill) continue;
    const readable = readableOn(rgb, fill, TEXT_CONTRAST);
    if (readable.rgb === rgb) continue;
    style.set('fill', `light-dark(${original}, ${readable.value})`);
    writeStyle(text, style);
  }
}
