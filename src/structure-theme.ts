import { areaColor, inkColor, LINE_CONTRAST, parseColor, readableOn, TEXT_CONTRAST, TEXT_ON_PAGE, themeSvg, toLab, type Rgb } from './theme';

/**
 * Dark-theme colours for one OpenChemLib structure (docs/adr/0002-dark-theme-colours.md, "SMILES
 * specifics"). `themeSvg` (src/theme.ts, shared verbatim by every plugin) assigns roles from the
 * SVG alone; OpenChemLib's drawing needs three roles it cannot guess, so they are written first, as
 * `light-dark()` values, which `themeSvg` then leaves alone:
 *
 * - Atom labels and SMARTS annotations are always ink on the page, never knockout text: a light
 *   label (chlorine's green, sulphur's yellow, the any-bond orange) keeps its own colour on the
 *   dark page rather than being mirrored to a dark one.
 * - SMARTS highlights are areas: the pale discs behind atoms (which `themeSvg` already treats as
 *   areas) and the thick band joining them, a `<line>` whose stroke is many bonds wide.
 * - Small filled dots (the any-bond and query markers) are marks, drawn as ink.
 *
 * Annotation text that sits on a highlight is then checked against the highlight's dark colour.
 * Colours in an embedded `<style>` (compose's scoped style carries none today) are rewritten too,
 * since `themeSvg` reads attributes and inline styles only.
 */

/** A band or disc this many bond widths across is a highlight, not a bond or a dot: OpenChemLib draws
    highlights about 16 bonds wide and its query dots about 7. */
const HIGHLIGHT_BONDS = 10;
/** Bond width when a drawing has no ordinary line to measure. */
const DEFAULT_BOND = 2.16;

function setStyle(element: Element, property: string, value: string): void {
  const kept = (element.getAttribute('style') ?? '').split(';').map((part) => part.trim())
    .filter((part) => part && part.slice(0, part.indexOf(':')).trim().toLowerCase() !== property);
  element.setAttribute('style', [...kept, `${property}:${value}`].join(';'));
}

function number(element: Element, name: string): number {
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) ? value : 0;
}

/** Every `fill`, `stroke`, `color` or `stop-color` value in a style sheet, with its dark counterpart. */
export function themeStyleText(css: string): string {
  return css.replace(/(^|[;{\s])(fill|stroke|color|stop-color|flood-color)\s*:\s*([^;}!]+)/gi, (whole, lead: string, property: string, value: string) => {
    const original = value.trim();
    const rgb = parseColor(original);
    if (!rgb) return whole;
    const name = property.toLowerCase();
    const dark = name === 'fill' || name === 'stop-color' || name === 'flood-color'
      ? (toLab(rgb).L < 0.4 ? inkColor(rgb, LINE_CONTRAST) : areaColor(rgb))
      : inkColor(rgb, LINE_CONTRAST);
    return `${lead}${property}:light-dark(${original}, ${dark.value})`;
  });
}

/** One drawing (an inner `<svg>` of the composed root, or the root itself when it holds shapes directly). */
function themeDrawing(drawing: Element): void {
  const children = [...drawing.children];
  const bonds = children.filter((child) => child.localName === 'line').map((line) => number(line, 'stroke-width')).filter((width) => width > 0);
  const bond = bonds.length ? Math.min(...bonds) : DEFAULT_BOND;
  let highlight: Rgb | undefined;
  for (const child of children) {
    const name = child.localName;
    if (name === 'line') {
      const rgb = parseColor(child.getAttribute('stroke') ?? '');
      if (rgb && number(child, 'stroke-width') >= HIGHLIGHT_BONDS * bond) {
        const dark = areaColor(rgb);
        setStyle(child, 'stroke', `light-dark(${child.getAttribute('stroke')}, ${dark.value})`);
        highlight = dark.rgb;
      }
    } else if (name === 'circle') {
      const rgb = parseColor(child.getAttribute('fill') ?? '');
      if (!rgb) continue;
      if (number(child, 'r') * 2 >= HIGHLIGHT_BONDS * bond) {
        const dark = areaColor(rgb);
        setStyle(child, 'fill', `light-dark(${child.getAttribute('fill')}, ${dark.value})`);
        highlight = dark.rgb;
      } else {
        setStyle(child, 'fill', `light-dark(${child.getAttribute('fill')}, ${inkColor(rgb, LINE_CONTRAST).value})`);
      }
    } else if (name === 'text') {
      const original = child.getAttribute('fill') ?? 'black';
      const rgb = parseColor(original);
      if (!rgb) continue;
      let dark = inkColor(rgb, TEXT_ON_PAGE);
      // An annotation drawn after a highlight sits on it: it must read there too.
      if (highlight) {
        const onHighlight = readableOn(dark.rgb, highlight, TEXT_CONTRAST);
        if (onHighlight.rgb !== dark.rgb) dark = onHighlight;
      }
      setStyle(child, 'fill', `light-dark(${original}, ${dark.value})`);
    }
  }
}

/** Give a composed smiles-renderer SVG its dark-theme colours; see the module comment. */
export function themeStructure(svg: Element): void {
  for (const style of svg.querySelectorAll('style')) style.textContent = themeStyleText(style.textContent ?? '');
  const drawings = [...svg.children].filter((child) => child.localName === 'svg');
  for (const drawing of drawings.length ? drawings : [svg]) themeDrawing(drawing);
  themeSvg(svg);
}
