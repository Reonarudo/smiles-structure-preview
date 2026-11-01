// The embedded worker bundle, built exactly as main.js embeds it, run under Node through the
// plugin's host. A small prelude gives the bundle the `self` a browser Worker would have. These
// pin the plugin's assumptions about the library's output, and carry the end-to-end expectations
// of smiles-markdown-preview's test/preview.test.ts; depiction itself is smiles-renderer's to test.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import type { RenderInput } from '@reonarudo/smiles-renderer';
import { bundleWorker } from '../scripts/worker-bundle.mjs';
import { createCache } from '../src/cache';
import { createHost, type Host, type HostOptions, type WorkerLike } from '../src/host';
import { fence } from './helpers';

const PRELUDE = `
const { parentPort } = require('node:worker_threads');
globalThis.self = {
  postMessage: (message) => parentPort.postMessage(message),
  set onmessage(handler) {
    parentPort.removeAllListeners('message');
    if (handler) parentPort.on('message', (data) => handler({ data }));
  }
};
`;

let source: string;
let host: Host;
const hosts: Host[] = [];

function spawn(): WorkerLike {
  const worker = new Worker(PRELUDE + source, { eval: true });
  const like: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: (message) => worker.postMessage(message),
    terminate: () => void worker.terminate()
  };
  worker.on('message', (data) => like.onmessage?.({ data }));
  worker.on('error', (error) => like.onerror?.(error));
  return like;
}

function start(options?: HostOptions): Host {
  const started = createHost(spawn, options);
  hosts.push(started);
  return started;
}

const render = (input: RenderInput) => host.render(input);

before(async () => {
  source = await bundleWorker();
  host = start();
});
after(() => { for (const each of hosts) each.dispose(); });

test('the bundle carries no Node module imports', () => {
  assert.doesNotMatch(source, /require\(["']node:|from["']node:|require\(["'](?:fs|path|crypto|worker_threads)["']\)/);
});

test('a molecule renders as one sanitized <svg class="smiles"> with a viewBox and a digest id, no size', async () => {
  const result = await host.render({ source: 'CCO', notation: 'smiles' });
  assert.equal(result.status, 'success');
  if (result.status !== 'success') return;
  const root = /^<svg [^>]*>/.exec(result.output)![0];
  assert.match(root, /\sclass="smiles"/);
  assert.match(root, /\sviewBox="0 0 [\d.]+ [\d.]+"/);
  assert.match(root, /\sid="smiles-[0-9a-f]{8}-root"/);
  assert.doesNotMatch(root, /\swidth=|\sheight=/);
  assert.doesNotMatch(result.output, /<script|\son\w+=|href=/i);
});

test('a Markdown document\'s fences render through the real worker', async () => {
  const aspirin = await fence('smiles {caption="Aspirin" algin="typo"}', 'CC(=O)Oc1ccccc1C(=O)O', render);
  const again = await fence('smiles', 'CC(=O)Oc1ccccc1C(=O)O', render);
  const mixed = await fence('smiles', 'CCO ethanol\n  C1CC\n[Na+].[Cl-] salt', render);
  const patterns = await fence('smarts', '[CX3](=O)[OX2H1] carboxylic acid\n[C;x3]', render);
  const all = [aspirin, again, mixed, patterns];
  const structures = all.flatMap((wrapper) => [...wrapper.querySelectorAll('.smiles-rendering svg.smiles')]);
  assert.equal(structures.length, 5);
  for (const svg of structures) assert.match(svg.getAttribute('width')!, /^[\d.]+px$/);
  assert.equal(patterns.querySelectorAll('svg.smiles.smarts').length, 1);
  assert.equal(patterns.querySelector('.smiles-label')!.textContent, 'carboxylic acid');
  assert.equal(patterns.querySelector('.smiles-error pre')!.textContent,
    "unexpected character inside brackets: 'x' at line 2, column 4\n\n[C;x3]\n   ^");
  assert.equal(aspirin.querySelector('figure.smiles-figure > svg.smiles') !== null, true);
  assert.equal(aspirin.querySelector('figcaption')!.textContent, 'Aspirin');
  // The library derives ids from the string, so the two aspirins share theirs.
  const ids = structures.map((svg) => svg.getAttribute('id'));
  assert.equal(new Set(ids).size, 4);
  assert.equal(mixed.querySelector('.smiles-label')!.textContent, 'ethanol');
  assert.ok([...mixed.querySelectorAll('text')].some((text) => text.textContent === 'Na'));
  assert.equal(mixed.querySelector('.smiles-error pre')!.textContent, 'dangling ring closure: 1 at line 2, column 7\n\nC1CC\n    ^');
});

test('label text in a fence stays text', async () => {
  const wrapper = await fence('smiles', 'CCO <img src=x onerror=alert(1)>\nC <script>alert(1)</script>', render);
  assert.equal(wrapper.querySelectorAll('.smiles-rendering img, .smiles-rendering script').length, 0);
  assert.equal(wrapper.querySelectorAll('.smiles-label').length, 2);
});

test('a SMARTS query in a smiles fence is a parse error, not a pattern', async () => {
  const result = await host.render({ source: '[C,N;!H0]~*', notation: 'smiles' });
  assert.equal(result.status, 'failure');
});

test('ten concurrent renders each get their own structure', async () => {
  const sources = Array.from({ length: 10 }, (_, i) => 'C'.repeat(i + 1));
  const results = await Promise.all(sources.map((smiles) => host.render({ source: smiles, notation: 'smiles' })));
  const ids = results.map((result) => result.status === 'success' ? /id="([^"]+)"/.exec(result.output)![1] : result.status);
  assert.equal(new Set(ids).size, 10);
});

test('a new host with a new budget, behind a new cache, retries a cached timeout', async () => {
  const slow: RenderInput = { source: 'C'.repeat(600), notation: 'smiles' };
  const tight = start({ timeout: 100 });
  const before = createCache((input) => tight.render(input));
  assert.deepEqual(await before.render(slow), { status: 'timeout', budget: 100 });
  assert.deepEqual(await before.render(slow), { status: 'timeout', budget: 100 }, 'still cached');
  tight.dispose();
  const roomy = start({ timeout: 10_000 });
  const after = createCache((input) => roomy.render(input));
  assert.equal((await after.render(slow)).status, 'success');
});
