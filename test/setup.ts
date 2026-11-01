// Loaded before every test file (package.json `test`): the host uses `window.setTimeout`, as an
// Obsidian plugin should, so under Node `window` is the global object.
(globalThis as { window?: unknown }).window ??= globalThis;
