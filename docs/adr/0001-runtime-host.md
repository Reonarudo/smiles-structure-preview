# 0001: Render in a browser Worker built from the renderer's worker code

Status: accepted, 2026-10-31.

## Context

smiles-renderer is a Node library: `createRuntime()` starts a `node:worker_threads` Worker that
imports OpenChemLib, and `render()` blocks on it with `Atomics.wait`. The VS Code extension calls
it from a synchronous markdown-it rule. An Obsidian plugin runs on the window's main thread of
Electron's renderer process. The pikchr pilot's spike (`docs/spike-worker-threads.md` in
pikchr-diagram-preview, copied here) measured, in Obsidian 1.14.4 (Electron 43.7.7, Node 24.21.0):

- `worker_threads` loads but cannot create a Worker ("The V8 platform used by this instance of
  Node does not support creating Workers"), so the library's runtime cannot start.
- `ELECTRON_RUN_AS_NODE` is fused off, so the plugin cannot fork Obsidian as a Node host.
- A browser `Worker` started from a blob URL runs an esbuild bundle of a renderer's worker code.

The alternatives were a system Node 22+ spawned as a host process (every user must install Node)
and adding a browser entry to each renderer package. The user chose the browser Worker bundle,
built by the plugin, for all six plugins.

What the smiles worker needs, checked for this port:

- OpenChemLib 9.25.0 (`dist/openchemlib.js`, an ES module of 1.1 MB, a GWT build) is pure
  JavaScript. At load it reads only `globalThis.devicePixelRatio` (falling back to 1) and
  `typeof process`; its `document`, `navigator` and `window` uses sit in the canvas editor and
  clipboard code, which depiction never reaches. Its Node paths (`process.getBuiltinModule`,
  `import.meta.dirname`) are in `Resources.registerFromNodejs`, and `import.meta.url` in
  `registerFromUrl`; neither is called. `Molecule.fromSmiles` and `toSVG` need no resources and
  no DOM (they run in Node without one, and in Obsidian's worker; see the live run).
- The renderer's `compose` uses `@xmldom/xmldom` (pure JavaScript) and one Node global,
  `Buffer.byteLength`, for the output limit.
- The library's runtime hashes `notation \0 source` with `node:crypto` to prefix the output's id.

## Decision

- `src/worker/entry.ts` ports the renderer's `dist/worker.js`: the same `depict` (OpenChemLib
  options, error-position parsing, removal of editor hit targets), the same warm-up renders before
  reporting ready, and the same `compose` imported from the installed package (through it, the
  sanitizer). OpenChemLib is imported statically, resolved from the renderer package's own
  dependency, instead of the library's `import('openchemlib')`: the bundle carries it either way,
  and an evaluation error still fails the start. `scripts/worker-bundle.mjs` bundles it with
  esbuild for the browser; `Buffer.byteLength` is injected (a `TextEncoder` count), and esbuild's
  empty-`import.meta` warning is silenced for the two resource loaders that never run.
  `scripts/build.mjs` embeds the bundle in `main.js` as a string, started from a blob URL.
- The worker answers with `postMessage` instead of the library's SharedArrayBuffer protocol.
  A request is exactly what the library posts: `{ notation, molecules, prefix, outputBytes }`,
  where `molecules` are the parsed lines `{ smiles, label?, line, column }`.
- `src/host.ts` ports `createRuntime` with the library's option and input validation, defaults
  (3 s per render, 10 s start-up, 64 000 characters per source, 4 000 per line, 4 MiB output),
  wording ("the fence contains no molecule", "OpenChemLib did not start within … ms") and recovery
  (terminate on timeout or a discarded engine, fresh worker on the next render). It parses lines
  with the extension's `molecules.ts` (the library's split, with a 0-based offset where the worker
  wants a 1-based column) and computes the id prefix with a synchronous SHA-256 (`src/sha256.ts`,
  tested against `node:crypto`), since `crypto.subtle` is asynchronous and needs a secure context.
  Renders are queued, one at a time, on one worker.
- As in the VS Code extension, each line of a fence is one render of the bare string; the row,
  labels and per-line error cards are the plugin's DOM (`src/fence.ts`). The cache is keyed by
  `notation \0 source`. A new depiction timeout means a new host and a new cache, as the extension
  restarts its runtime and clears its cache.
- The renderer package stays untouched and is still the dependency, pinned to its release
  tarball; its version in `package.json` decides the OpenChemLib, sanitizer and composer that ship.

## Consequences

- No Node, no files written, nothing extracted: `main.js`, `manifest.json` and `styles.css` are
  the whole plugin, as Obsidian's community install expects. OpenChemLib makes `main.js` large:
  1.24 MB, 386 kB gzipped.
- A browser Worker has no heap cap like the library's `resourceLimits` (256 MB old generation);
  a runaway depiction is stopped only by the time limit.
- Starting a worker evaluates OpenChemLib and runs the two warm-up depictions: about 350 ms under
  Node, before the first render is answered.
- The plugin's worker entry and host must be kept in step with the renderer's `worker.ts` and
  `runtime.ts` when the renderer changes; `test/worker.test.ts` runs the embedded bundle against
  the real engine.
- Nothing in the plugin needs Node or Electron, so it is not desktop-only. A blob-URL Web Worker
  is available in the mobile apps' web views, and OpenChemLib is plain JavaScript (its one Node
  path, `Resources.registerFromNodejs`, is guarded by `typeof process` and never called). Checked
  under Obsidian's mobile emulation, to be confirmed on devices through a BRAT pre-release. On a
  phone the 1.3 MB `main.js` and OpenChemLib's start-up (evaluation plus two warm-up depictions)
  cost more than on a desktop; the worker starts only when the first structure is drawn.
