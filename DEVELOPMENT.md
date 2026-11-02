# Developing SMILES Structure Preview

How the plugin works inside, and how to build, test and release it. For using the plugin, see
[README.md](README.md).

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


## Releasing

Push a version tag (`x.y.z`, equal to the version in `manifest.json`). The release workflow in
`.github/workflows/release.yml` checks, tests and builds that commit, attests `main.js`,
`manifest.json` and `styles.css`, and publishes them as the release.
