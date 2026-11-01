// The cache in front of the host: the VS Code extension's createRenderer tests (test/preview.test.ts),
// made asynchronous, with the pilot's in-flight sharing and eviction tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RenderInput, RenderResult } from '@reonarudo/smiles-renderer';
import { createCache } from '../src/cache';

const ok = ({ source }: RenderInput): RenderResult => ({ status: 'success', output: `<svg>${source}</svg>`, notes: [] });
const smiles = (source: string): RenderInput => ({ source, notation: 'smiles' });

test('outcomes are cached per notation and string, timeouts included, until cleared', async () => {
  let calls = 0;
  const cache = createCache(async () => { calls++; return { status: 'timeout', budget: 1 }; });
  await cache.render(smiles('CCO'));
  await cache.render(smiles('CCO'));
  assert.equal(calls, 1);
  await cache.render({ source: 'CCO', notation: 'smarts' });
  assert.equal(calls, 2);
  cache.clear();
  await cache.render(smiles('CCO'));
  assert.equal(calls, 3);
});

test('renders once per input, sharing a render still in flight', async () => {
  const calls: string[] = [];
  const cache = createCache(async (input) => { calls.push(input.source); return ok(input); });
  const [a, b] = await Promise.all([cache.render(smiles('CCO')), cache.render(smiles('CCO'))]);
  assert.deepEqual(a, b);
  await cache.render(smiles('CCO'));
  assert.deepEqual(calls, ['CCO']);
});

test('failures and timeouts are cached, unavailable and rejections are not', async () => {
  const calls: string[] = [];
  const results: Record<string, RenderResult> = {
    f: { status: 'failure', message: 'no' },
    t: { status: 'timeout', budget: 1 },
    u: { status: 'unavailable', reason: 'down' }
  };
  const cache = createCache(async ({ source }) => {
    calls.push(source);
    if (source === 'x') throw new Error('bug');
    return results[source]!;
  });
  for (const source of ['f', 't', 'u', 'f', 't', 'u']) await cache.render(smiles(source));
  await assert.rejects(cache.render(smiles('x')));
  await assert.rejects(cache.render(smiles('x')));
  assert.deepEqual(calls, ['f', 't', 'u', 'u', 'x', 'x']);
});

test('the least recently used input is evicted first', async () => {
  const calls: string[] = [];
  const cache = createCache(async (input) => { calls.push(input.source); return ok(input); }, 2);
  for (const source of ['a', 'b', 'a', 'c', 'a', 'b']) await cache.render(smiles(source));
  assert.deepEqual(calls, ['a', 'b', 'c', 'b']);
});

test('onFresh hears every real render, never a cache hit', async () => {
  const heard: string[] = [];
  const cache = createCache(async (input) => ok(input), 96, ({ notation, source }) => heard.push(`${notation}:${source}`));
  await cache.render(smiles('C'));
  await cache.render(smiles('C'));
  await cache.render({ source: 'C', notation: 'smarts' });
  assert.deepEqual(heard, ['smiles:C', 'smarts:C']);
});
