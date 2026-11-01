# The view toggle

In Reading view, hovering a `smiles` or `smarts` code block below shows a button in its top
corner that flips it between the structures and the block's source. In Live Preview the same
corner holds Obsidian's own "Edit this block" button, as for Mermaid. This note is the fixture for
`npm run test:live` and the document for the manual checklist: open it in Reading view and in
Live Preview, in a light and a dark theme.

## 1. A plain fence

```smiles
CC(=O)Oc1ccccc1C(=O)O aspirin
```

## 2. Captioned, centred: the button stays at the column edge

```smiles {caption="Figure 1: L-alanine, stereocentre marked" align="center"}
C[C@H](N)C(=O)O
```

## 3. Right-aligned with alt: the card stops beside the button

```smiles {alt="ethanol" align="right"}
CCO
```

## 4. Error card: the source view shows the body alone

```smiles
C1CC
```

## 5. Long lines and a tall body: horizontal scroll, a wrapping row

```smiles
CCCCCCCCCCCCCCCC(=O)OC[C@H](COP(=O)([O-])OCC[N+](C)(C)C)OC(=O)CCCCCCC/C=C\CCCCCCCC POPC, a phospholipid whose line runs well past the width of the column
CCO ethanol
c1ccccc1 benzene
Cn1cnc2c1c(=O)n(C)c(=O)n2C caffeine
CC(C)Cc1ccc(cc1)C(C)C(=O)O ibuprofen
CN1CCC[C@H]1c2cccnc2 nicotine
C(C1C(C(C(C(O1)O)O)O)O)O glucose
OC(=O)CCCCC(=O)O adipic acid
```

## 6. Two identical bodies: flip the second one only, then edit this heading

```smiles
[Na+].[Cl-] salt
```

```smiles
[Na+].[Cl-] salt
```

## 7. Ordinary fences: no toggle, Obsidian's own copy button

```json
{ "compare": "Obsidian's copy button on hover, no view toggle" }
```

`smi` is not claimed; it stays an ordinary code block:

```smi
CCO left alone
```

## 8. In a list item and a callout: attributes still apply

- A list item holding a structure:

    ```smiles {caption="Inside a list item"}
    c1ccncc1 pyridine
    ```

> [!note] A callout
> ```smarts {caption="Inside a callout" align="center"}
> [NX3;H2,H1;!$(NC=O)] amine, not amide
> ```

## 9. Quirks

A `smarts` fence is claimed too, so its source view carries `language-smarts`, and its
structures carry an extra `smarts` class:

```smarts
[CX3](=O)[OX2H1] carboxylic acid
[C,N;!H0]~* C or N with a hydrogen
```

A multi-line fence is one block: one button, one source view of the whole body, while the
broken line shows its error card in its own cell of the row:

```smiles
CCO ethanol
C1CC broken
CCC propane
```

An empty fence is a block as well: its error card gets the button, and its source view is
empty:

```smiles
```

A molecule that takes longer than the depiction timeout (3 seconds by default; see the plugin's
settings) shows a timeout card, which the toggle treats like any error card.
