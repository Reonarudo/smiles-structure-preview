# Spike: hosting the pikchr renderer inside Obsidian

> Copied from the pikchr pilot (pikchr-diagram-preview) as the evidence for ADR 0001. The `spike/` code it names lives in that repository.

Date: 2026-10-31. Obsidian 1.14.4, Electron 43.7.7, Chrome 150.0.7871.250, embedded Node 24.21.0.
Run in an isolated profile (`--user-data-dir=/tmp/obsidian-spike/profile`) against
`~/Developer/obsidian-plugins/test-vault`, driven over CDP with playwright-core.
Code: `spike/spike-plugin.main.js` (worker_threads), `spike/browser-worker.entry.mjs` + `fs-stub.mjs` + `shim.js` (browser Worker).

## Result: worker_threads is not available; a browser Worker is

| Step | Outcome |
| --- | --- |
| Embedded Node version | 24.21.0, so `engines.node >= 22` is met |
| `require('node:worker_threads')` | loads; `Worker` is a function |
| `new Worker(...)` from worker_threads | **fails**: "The V8 platform used by this instance of Node does not support creating Workers" |
| `createRuntime()` from the renderer | fails for the same reason (it spawns a worker_threads Worker) |
| `require(esm)` of `dist/index.js` | works |
| `import(file://...)` of `dist/index.js` | fails: "Failed to fetch dynamically imported module" |
| `ELECTRON_RUN_AS_NODE=1 Obsidian` | ignored (runAsNode fuse off): launches the app, so no Node child via fork |
| Browser `Worker` from a blob URL, esbuild bundle of the worker | **works** |
| SharedArrayBuffer posted to that Worker | works, although `crossOriginIsolated` is false |
| `Atomics.waitAsync` on the main thread | works |
| Engine start | 76 ms |
| Renders (`box`, two-shape chain, syntax error, `print` note) | 0–4 ms each; success, failure and notes all correct |
| `terminate()` | immediate |
| Bundle size | 251 KB minified, 87 KB gzipped (engine with embedded wasm, interpreter, sanitizer, xmldom) |
| Plugin enable/disable 10x | RSS 211 → 215 MB, heap 21 → 23 MB |

## How the browser bundle was made

The pikchr engine (`vendor/pikchr/pikchr.cjs`, emcc `ENVIRONMENT=node`, `SINGLE_FILE`) touches Node only
through a dead `fs.readFileSync` path, `__dirname` and `process.argv`; the wasm is embedded. esbuild with
`--platform=browser --alias:node:fs=./fs-stub.mjs --inject:./shim.js` bundles it with `dist/interpret.js`
(and through it the sanitizer and `@xmldom/xmldom`). The entry is a port of `dist/worker.js` that takes the
shared buffer in its first message instead of `workerData`; the protocol is unchanged.

## Consequences for the plan

- Phase 2 (async mode via worker_threads) and the extraction of the runtime into the plugin folder
  (`bundle.ts`) are not needed for pikchr: the worker bundle can be embedded as a string in `main.js`
  and started from a blob URL. No external Node, no files written.
- The renderer packages' worker-side Node use in the other five is asset location only
  (`readFile`, `createRequire`, `import.meta.url`), which bundling resolves by embedding. Their
  `prepare` steps (gnuplot data files, spice includes) run on the main thread, where Obsidian's Node
  `fs` is available, or over the vault adapter.
- Decided in ADR 0001: the plugin builds and embeds the browser Worker bundle, answering by
  `postMessage` rather than over shared memory.
