# Release verification: 0.1.2

Date: 2026-11-01. Tag `0.1.2` on commit 65fd17c, built and published by the release workflow:
https://github.com/Reonarudo/smiles-structure-preview/actions/runs/41310109665

## Assets

| File | Bytes | SHA-256 | Attestation |
| --- | --- | --- | --- |
| `main.js` | 1260444 | `80fef0f071b094e236f1b5885a56573856b30b1ab61354932cf88579500ecf76` | verified with `gh attestation verify` |
| `manifest.json` | 386 | `a4201371faf6f42308123246341750b69ef967ae87400cf4b0f57affe2941c49` | verified with `gh attestation verify` |
| `styles.css` | 5881 | `e3a37133a2984a52fd53ab06e6258f7d93948c56379b1cf65a32fa0ff6c29dba` | verified with `gh attestation verify` |

The release carries only these three files.

## Checks

- In the workflow: tag matches `manifest.json` and `versions.json`; `npm ci`; `tsc --noEmit`; `npm test`
  (108 passed, 0 failed); `npm run build`.
- Downloaded assets installed in a throwaway vault in Obsidian 1.14.4: blocks draw in an embedded note (Reading view and
  Live Preview) and in Canvas text and note cards.
- `main.js` differs from 0.1.1 only in the embedded copy of this repository's `LICENSE`, which lost a trailing
  sentence so GitHub recognises it as MIT.
