# Release verification: 0.1.0 (pre-release)

Date: 2026-11-01. Tag `0.1.0` on commit 57ca562. GitHub pre-release:
https://github.com/Reonarudo/smiles-structure-preview/releases/tag/0.1.0

## Assets

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `main.js` | 1260534 | `8097840dae0f484be612a655dc91984f616f5447374dbf44cb2b62116b5fe387` |
| `manifest.json` | 383 | `08e3efae26050539daa9f210118b971d88c0bfe6cd4d39b0f80538ef6cd17b06` |
| `styles.css` | 5881 | `e3a37133a2984a52fd53ab06e6258f7d93948c56379b1cf65a32fa0ff6c29dba` |

Desktop only: no (desktop and mobile). Minimum Obsidian version: 1.5.0.

## Checks on the tagged tree

- `npm run lint` (tsc): clean.
- Obsidian's review linter (`eslint-plugin-obsidianmd` 0.4.2, recommended config) on `src/`: no errors, no warnings.
- `npm test`: 108 passed, 0 failed.
- `npm run test:live` against Obsidian 1.14.4: 22 live checks passed.

## The published assets

- Downloaded with `gh release download 0.1.0` into an empty directory; `shasum -a 256 -c SHA256SUMS`: all OK; `main.js`
  byte-identical to the build from the tagged tree.
- Installed into a throwaway vault in Obsidian 1.14.4 with a throwaway profile: blocks draw, with captions, in an embedded
  note (Reading view and Live Preview) and in Canvas text and note cards.

## Not yet verified

- On real phones (iOS, Android) through BRAT.

## Promotion

2026-11-01: promoted from pre-release to release, same tag and the same assets (no rebuild).
