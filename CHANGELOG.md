# Changelog

## 0.1.3 (2026-11-01)

- Settings come only from Obsidian's declarative settings definitions; the older `display()`
  method, needed only before Obsidian 1.13, is gone (the minimum is 1.14.4).

## 0.1.2 (2026-11-01)

- Releases are built by GitHub Actions from the tagged commit, with signed build provenance
  attestations for `main.js`, `manifest.json` and `styles.css`. Check a download with
  `gh attestation verify main.js -R Reonarudo/smiles-structure-preview`.
- Releases carry only the files Obsidian installs; `SHA256SUMS` is gone, as the attestations
  cover it.

## 0.1.1 (2026-11-01)

- The minimum Obsidian version is now 1.14.4, the version every check ran against; 1.5.0 was
  never tested.
- The description capitalizes its proper nouns.

## 0.1.0 (2026-11-01)

First version, ported from the VS Code extension
[smiles-structure-preview](https://github.com/Reonarudo/smiles-markdown-preview) 0.4.0.

- `smiles` and `smarts` code blocks render as chemical structures in Reading view and Live
  Preview; `smi` blocks are left alone.
- One molecule (or pattern) per line, with an optional label after the first whitespace, as in
  `.smi` files. Several molecules, or a labelled one, sit side by side in a row that wraps.
- A line that does not parse shows its own error card, naming its line and column in the block
  and quoting the string with a caret; the other lines still render.
- Attribute blocks on the fence: `alt`, `caption`, `align`, `class`. Structures from a `smarts`
  block carry an extra `smarts` class.
- In Reading view, a button on every block flips it between the structures and its source. It
  looks and sits like Obsidian's own "Edit this block" button and appears on hover. Flips are
  remembered per note, follow renames, and apply in every Reading view of the note.
- In Live Preview the block always shows its structures, and Obsidian's own "Edit this block"
  button opens it for editing, as for Mermaid.
- Structures follow dark themes as Mermaid's do: each colour gets a dark-theme counterpart by its
  role (bonds and atom labels lightened only as needed, SMARTS highlights darkened, hues kept, so
  chlorine stays green), switching with the theme without a re-render; a setting keeps them on a
  white card instead.
- Rendering runs in a Web Worker inside Obsidian, from smiles-renderer 1.0.0's sanitizer and
  OpenChemLib 9.25.0; no Node install is needed.
- Settings: depiction timeout (seconds per molecule), following dark themes, debug logging; listed
  in Obsidian's settings search (1.13 and later).
- The renderer starts with the first structure drawn, not when Obsidian starts.
- Structures draw in embedded notes, hover previews, Canvas and PDF export, and are built with
  Obsidian's DOM helpers, so pop-out windows get their own elements.
- On an Obsidian whose Chromium lacks `light-dark()`, structures keep their white card.
- Mobile: the plugin is not desktop-only; on touch devices the source button stays visible.
- Commands: restart the renderer; show every structure in the current note.
