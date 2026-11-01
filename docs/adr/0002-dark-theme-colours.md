# 0002: Dark-theme colours by role, not by inverting the drawing

Status: accepted, 2026-11-01.

## Context

Mermaid diagrams in Obsidian follow the theme. The plugins first did the same with
`filter: invert(1) hue-rotate(180deg)`, which keeps every label's contrast with its own box but
flips every colour, readable or not: gnuplot's yellow line turned dark olive, SMILES chlorine a dark
green, light-blue and orange lines went dim. A Graphviz graph's own background could not be told
from the renderer's default.

## Decision

`src/theme.ts` gives each colour in the drawing a dark counterpart by its role, computed once when
the plugin inserts the SVG, in OKLab so hue is kept:

- **Ink** (strokes, the `color` property, dark marks such as arrowheads, dark text): lightened
  only as far as needed to read on Obsidian's dark page, 3:1 for lines and marks, 5:1 for text
  (4.5 plus a margin for text on a darkened pastel box). Near-black greys become `--text-normal`.
- **Areas** (fills of L 0.4 and up, gradient stops): lightness mirrored between white and the
  page, so paper becomes the page and pale boxes become dark ones.
- **Knockout text** (near-white text, L 0.75 and up with almost no colour, drawn on a dark fill):
  mirrored like an area. Coloured light text, such as a bright green atom label, is ink.
- A fill set on a group that holds text counts as text, so a group colouring its labels reaches
  the text target.
- Text inside a group that also holds a filled shape is checked against that shape's dark fill;
  near-black marks such as arrowheads never count as what a label sits on.

Each colour is written as `light-dark(<original>, <dark>)`, the original text kept verbatim, and
the stylesheet sets the drawing's `color-scheme` to `dark` only in a dark theme with "Follow dark
themes" on. Switching theme or setting needs no re-render; the light theme and the white card are
exactly the renderer's colours.

## Consequences

- Readable colours stay as they are; only what would not read changes.
- The dark targets are measured against Obsidian's default dark page (#1e1e1e) and text
  (#dadada); a custom theme with a much lighter dark background gets less margin.
- Colours the module cannot parse (`url()`, `currentColor`, unknown names) are left alone; so is
  anything a renderer sets in an embedded `<style>`, unless the plugin handles it.
- Flat drawings (pikchr) have no groups, so text on a dark author-chosen fill relies on the
  knockout rule.

## SMILES specifics

OpenChemLib draws flat structures: one inner `<svg>` per line of the fence (smiles-renderer's
`compose`), holding `line`, `text`, `circle` and `polygon` elements with `rgb()` attributes and no
groups. Three of its roles cannot be read from the SVG alone, so `src/structure-theme.ts` writes
them as `light-dark()` before `themeSvg` runs (which then leaves them alone):

- **Atom labels and SMARTS annotations are ink.** They never sit on a dark fill, so the knockout
  rule would wrongly mirror light CPK colours: chlorine's green (31,240,31), sulphur's yellow and
  the like would turn dark. As ink they keep their colour wherever it already reads (chlorine
  does, at about 11:1 on the page) and are lightened to 5:1 otherwise (oxygen's dark red, the
  stereo labels' 160,0,0).
- **SMARTS highlights are areas.** The pale pink discs behind matched atoms are filled circles,
  which `themeSvg` would already treat as areas, but the band joining two of them is a `<line>`
  with a stroke about 16 bonds wide, which it would treat as ink and leave bright pink. Lines and
  circles at least ten bond widths across (the bond width measured from the drawing's thinnest
  line) are therefore areas; annotations drawn after a highlight are also checked to read on its
  dark colour at 4.5:1.
- **Small dots are marks.** The orange any-bond and query dots (about seven bond widths across)
  are filled circles of high lightness that `themeSvg` would darken as areas; they are ink, so
  they keep their orange.

`compose` also embeds a scoped `<style>`. Today it carries no colours (font family, line caps and
joins only), but its colour declarations, if any, are rewritten to `light-dark()` too, since
`themeSvg` does not read style sheets. The plugin's own text around the structures (labels below
each structure, captions, per-line error cards) is HTML and follows Obsidian's theme by itself.
