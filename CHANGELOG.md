# Changelog

## 0.1.0 (unreleased)

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
- Settings: depiction timeout (seconds per molecule), following dark themes, debug logging.
- Commands: restart the renderer; show every structure in the current note.
