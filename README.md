# SMILES Structure Preview

Draw chemical structures in your notes from [SMILES](https://en.wikipedia.org/wiki/Simplified_Molecular_Input_Line_Entry_System)
strings. Write a `smiles` code block and the molecule appears in its place, in Reading view and
Live Preview, on desktop and mobile. SMARTS patterns work too.

~~~markdown
```smiles
CC(=O)Oc1ccccc1C(=O)O aspirin
```
~~~

## Features

- Structures in Reading view, Live Preview, embedded notes, hover previews, Canvas cards and
  exported PDFs.
- Several molecules side by side, each with its own label.
- SMARTS substructure patterns, with each constraint marked on its atom or bond.
- Captions, alignment and alt text for each block.
- A button to see the strings without leaving Reading view.
- Follows your theme: structures stay readable in dark themes.
- Works offline.

## Install

1. In Obsidian, open **Settings → Community plugins** and turn off **Restricted mode** if it's on.
2. Select **Browse**, search for **SMILES Structure Preview**, then select **Install** and
   **Enable**.

To install by hand instead, download `main.js`, `manifest.json` and `styles.css` from the
[latest release](https://github.com/Reonarudo/smiles-structure-preview/releases/latest) into
`<your vault>/.obsidian/plugins/smiles-structure-preview/`, then enable the plugin.

## Writing structures

Put a SMILES string in a code block tagged `smiles`. Blocks tagged `smi` are left as plain code.

### Several molecules

Write one molecule per line. Text after the first space is the molecule's label, as in `.smi`
files. The molecules sit side by side and wrap to the width of the note:

~~~markdown
```smiles
CCO ethanol
c1ccccc1 benzene
[Na+].[Cl-] table salt
```
~~~

### SMARTS patterns

Tag a block `smarts` to draw substructure patterns instead of molecules. Each constraint is marked
on the atom or bond it applies to:

~~~markdown
```smarts
[CX3](=O)[OX2H1] carboxylic acid
[C,N;!H0]~* C or N with a hydrogen
```
~~~

A SMARTS pattern in a `smiles` block is an error: the tag decides how each line is read.

### Captions and other options

Add options in braces after the tag:

~~~markdown
```smiles {caption="Figure 1: Acetylsalicylic acid" align="center" alt="Aspirin"}
CC(=O)Oc1ccccc1C(=O)O
```
~~~

| Option | What it does |
| --- | --- |
| `caption` | Text shown under the structures. |
| `align` | `left`, `center` or `right`. |
| `alt` | A description read aloud by screen readers. |
| `class` | A CSS class, for styling the structures with a CSS snippet. |

Put each value in quotes. Values are plain text, not Markdown. If an option is misspelled, it's
ignored and the structures still appear.

## Viewing the strings

- **Reading view:** hover over a block and select the **</>** button in its corner to see the
  strings. Select it again to see the structures. Obsidian remembers which blocks you switched,
  even after a restart. **Show every structure in this note** in the command palette switches them
  all back.
- **Live Preview:** select Obsidian's own **Edit this block** button, just as for a Mermaid
  diagram.
- **Phones and tablets:** the button is always visible.

## Dark and light themes

Structures follow your theme. In a dark theme, bonds take your theme's text colour and atom colours
are lightened only as much as needed to read, so oxygen stays red and chlorine green. In a light
theme, structures appear on a white card with their usual colours.

To always show the usual colours on a white card, turn off **Follow dark themes** in the plugin's
settings.

## Settings

| Setting | What it does |
| --- | --- |
| **Depiction timeout** | How long drawing one molecule may take before it's shown as an error. 3 seconds by default, from 0.5 to 60. |
| **Follow dark themes** | On by default. Turn off to keep every structure on a white card. |
| **Debug logging** | Writes ignored options to the developer console, to help find a typo. |

## Commands

| Command | What it does |
| --- | --- |
| **Show every structure in this note** | Switches every block in the note back from strings to structures. |
| **Restart renderer** | Starts the drawing engine afresh, retrying molecules that timed out. |

## When something goes wrong

- **A string that doesn't parse:** an error appears in place of that one molecule, quoting the
  string with a caret under the problem. The other lines still draw.
- **"Depiction took longer than…":** the molecule hit the **Depiction timeout**. Raise the limit in
  settings.
- **Long strings:** each line may be up to 4,000 characters.

## Privacy

Structures are drawn on your device, inside Obsidian. The plugin doesn't connect to the internet,
doesn't collect any data, and doesn't read or write any files.

## Credits

Structures are drawn by [OpenChemLib](https://github.com/cheminfo/openchemlib-js). The licenses of
the software built into this plugin are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Released under the [MIT License](LICENSE). To build or change the plugin, see
[DEVELOPMENT.md](DEVELOPMENT.md).
