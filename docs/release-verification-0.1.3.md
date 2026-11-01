# Release verification: 0.1.3

Date: 2026-11-01. Tag `0.1.3` on commit 6484e7f, built and published by the release workflow:
https://github.com/Reonarudo/smiles-structure-preview/actions/runs/41311545549

## Assets

| File | Bytes | SHA-256 | Attestation |
| --- | --- | --- | --- |
| `main.js` | 1259332 | `1e05048dd679817b217e9872eafbb7cb8ce47cde3458c606f921cad4e5a19cff` | verified with `gh attestation verify` |
| `manifest.json` | 386 | `6aaeb036a8af4617849d765b7dcc63ed61faed886fa0a2543b9b62e990730661` | verified with `gh attestation verify` |
| `styles.css` | 5881 | `e3a37133a2984a52fd53ab06e6258f7d93948c56379b1cf65a32fa0ff6c29dba` | verified with `gh attestation verify` |

## Checks

- In the workflow: tag matches `manifest.json` and `versions.json`; `npm ci`; `tsc --noEmit`; `npm test` (108 passed,
  0 failed); `npm run build`.
- Obsidian's review linter on `src/`: no findings. No `display()` method and no `!important` remain, the two
  community directory warnings on 0.1.2.
- `npm run test:live` against Obsidian 1.14.4 on the tagged tree: all checks passed.
- Downloaded assets installed in a throwaway vault in Obsidian 1.14.4: blocks draw in an embedded note.
