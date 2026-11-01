# SMILES Structure Preview

Renders SMILES molecules and SMARTS patterns in Obsidian code blocks as chemical structures, in
Reading view and Live Preview, drawn by OpenChemLib through
[smiles-renderer](https://github.com/Reonarudo/smiles-renderer). A port of the VS Code extension
of the same name.

## Usage

Write a SMILES string in a block tagged `smiles`:

~~~markdown
```smiles
CC(=O)Oc1ccccc1C(=O)O
```
~~~

Only `smiles` and `smarts` blocks are claimed; `smi` blocks are left as ordinary code.

### Several molecules

Each non-blank line is one molecule. Text after the first whitespace labels it, as in `.smi`
files; the molecules sit side by side, each label beneath its structure, and the row wraps to the
column:

~~~markdown
```smiles
CCO ethanol
c1ccccc1 benzene
[Na+].[Cl-] table salt
```
~~~

### SMARTS patterns

A block tagged `smarts` parses each line as a SMARTS substructure query instead of a molecule,
with each constraint annotated on the atom or bond it applies to:

~~~markdown
```smarts
[CX3](=O)[OX2H1] carboxylic acid
[C,N;!H0]~* C or N with a hydrogen
```
~~~

Labels, attributes and limits work as for `smiles` blocks, and each pattern's `<svg>` carries an
extra `smarts` class. The notation is never guessed: a SMARTS query in a `smiles` block is a parse
error.

## Fence attributes

A block may carry an attribute block after its tag:

~~~markdown
```smiles {alt="Aspirin" caption="Figure 1: Acetylsalicylic acid" align="center"}
CC(=O)Oc1ccccc1C(=O)O
```
~~~

- `alt`: an accessible name, for readers using assistive technology.
- `caption`: plain text shown beneath the structures.
- `align`: `left`, `center` or `right`.
- `class`: an extra CSS class on each structure's `<svg>`, alongside the built-in `smiles` class.

Values must be quoted, with single or double quotes; a backslash escapes a matching quote or a
backslash. Values are plain text, never Markdown or HTML. Anything unrecognised is ignored and the
structures still render; turn on **Debug logging** in the plugin's settings to see what was
ignored in the developer console.

Attributes are read from the note's text. Where Obsidian renders a block without its note (some
embeds and exports), the structures render bare.

## Viewing the source

The plugin follows Obsidian's own handling of Mermaid diagrams:

- **Live Preview:** hovering a block shows Obsidian's **Edit this block** button in its top
  corner, which opens the code block for editing, as for Mermaid. Live Preview always shows the
  structures.
- **Reading view:** hovering a block shows a button of the same look in the same corner,
  **Show source**, which flips the block to its source text; **Show structure** flips it back. A
  multi-line block flips as a whole. A flipped block stays flipped across re-renders, reopening
  the note and restarting Obsidian, and in every Reading view of the note. Two blocks with the
  same body are told apart by their order among all of the note's `smiles` and `smarts` blocks.
  **Show every structure in this note** in the command palette flips them all back.

## Errors and limits

A SMILES or SMARTS parse error is shown in place of that one structure, naming its line and column
in the block and quoting the string with a caret under the offending position; the other lines
still render. An empty block shows an error card. Each string is limited to 4 000 characters, and
by default each molecule has 3 seconds to be depicted; a molecule that takes longer shows a
timeout card until its string changes. Change the limit with **Depiction timeout** in the plugin's
settings (seconds, 0.5 to 60); a change restarts the renderer, and molecules that timed out are
tried again. **Restart renderer** in the command palette does the same without a change.

Structures follow the theme, as Mermaid diagrams do. In a dark theme they sit on the page in
dark-theme colours: bonds and atom labels are lightened only as far as needed to read, and hues are
kept, so CPK colours that already read on a dark page (chlorine's green, the any-bond orange) stay
as they are, black bonds take Obsidian's text colour and oxygen's dark red is lightened. SMARTS
highlights become dark areas with their annotations readable on them. In a light theme structures
sit on a white card with OpenChemLib's exact colours. To keep every structure on a white card, turn
off **Follow dark themes** in the plugin's settings.

## How it renders

Rendering runs in a Web Worker inside Obsidian, built from smiles-renderer's worker: OpenChemLib
(pure JavaScript) depicts each line, and the renderer's allowlist sanitizer rebuilds its SVG.
Nothing is downloaded, installed or written to disk; the worker is embedded in `main.js`, which is
why the plugin is about 1.3 MB (about 390 kB compressed).

The worker starts with the first structure drawn, so a vault without smiles or smarts blocks never
loads OpenChemLib. Structures also draw in embedded notes, hover previews, Canvas cards and exported
PDFs (in light colours). Settings appear in Obsidian's settings search. On an
Obsidian whose built-in Chromium predates `light-dark()`, structures keep the white card in dark
themes.

Works on desktop and on Obsidian's mobile apps, where the source button stays visible (there is
no hover to reveal it). Nothing in the plugin needs Node or Electron. On a phone, mind that
`main.js` is about 1.3 MB (OpenChemLib is most of it), and that the first structure in a session
waits for the worker to load OpenChemLib and warm it up (about a third of a second on a desktop,
longer on a phone); a vault without smiles or smarts blocks never loads it. Rows of structures wrap
to the narrow column, and a wide molecule scales down to fit.

## Development

Requires Node 22 or newer (see `.nvmrc`).

~~~sh
npm ci
npm run lint        # tsc --noEmit
npm test            # node --test: attributes, molecules, toggle, scanner, DOM, cache, host, settings, and the real worker bundle
npm run build       # main.js, with the worker bundle embedded
npm run vault       # link this repo into ../test-vault as an enabled plugin
npm run test:live   # a real Obsidian with a throwaway profile and vault, driven over CDP
~~~

`npm run test:live` needs Obsidian installed (`OBSIDIAN_EXECUTABLE` overrides the path); it prints
where it saved light and dark screenshots.

The renderer is pinned to a release tarball in `package.json` (`.npmrc` sets `allow-remote=root`
for npm 12). To take a new release, edit the URL, run `npm install`, check `src/worker/entry.ts`
against the release's `src/worker.ts` and `src/host.ts` against its `src/runtime.ts`, and run the
tests.

## License

MIT for this plugin; OpenChemLib, embedded in `main.js`, is BSD-3-Clause. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
