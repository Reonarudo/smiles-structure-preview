// Bundles src/worker/entry.ts for a browser Worker and returns its source, which build.mjs embeds
// in main.js. The renderer package's `compose` (and through it its sanitizer and xmldom) is reached
// through `#renderer/...`, since its public `exports` name only the Node entry point; OpenChemLib
// is resolved from the renderer package, so the engine that ships is the one it depends on.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(root, 'package.json'));
export const rendererDir = dirname(require.resolve('@reonarudo/smiles-renderer/package.json'));
const engine = createRequire(join(rendererDir, 'package.json')).resolve('openchemlib');

const renderer = {
  name: 'renderer-files',
  setup(context) {
    context.onResolve({ filter: /^#renderer\// }, (args) => ({ path: join(rendererDir, args.path.slice('#renderer/'.length)) }));
    context.onResolve({ filter: /^openchemlib$/ }, () => ({ path: engine }));
  }
};

export async function bundleWorker({ minify = true } = {}) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['src/worker/entry.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: 'chrome120',
    minify,
    legalComments: 'none',
    inject: ['src/worker/node-globals.ts'],
    plugins: [renderer],
    // OpenChemLib's resource loaders (`registerFromUrl`, `registerFromNodejs`) read import.meta;
    // depiction never calls them, so its emptiness in a classic worker script does not matter.
    logOverride: { 'empty-import-meta': 'silent' },
    logLevel: 'warning'
  });
  return result.outputFiles[0].text;
}
