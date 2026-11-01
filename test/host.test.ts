// The host's behaviour against scripted workers: start-up, timeouts, a discarded engine, the
// queue, limits and dispose. The real worker is exercised in worker.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { RenderInput, RenderResult } from '@reonarudo/smiles-renderer';
import { createHost, type WorkerLike } from '../src/host';
import type { Reply, Request, WorkerMessage } from '../src/protocol';
import { sha256 } from '../src/sha256';

const smiles = (source: string): RenderInput => ({ source, notation: 'smiles' });

type Answer = Omit<Reply, 'type' | 'id'> | 'hang';
interface Script {
  start?: 'ok' | 'fail' | 'silent';
  answer?: (smiles: string) => Answer;
}

/** Workers that start and answer as scripted, recording what they were asked and whether they were stopped. */
function workers(script: Script = {}) {
  const spawned: { requests: Request[]; terminated: boolean }[] = [];
  const spawn = (): WorkerLike => {
    const record = { requests: [] as Request[], terminated: false };
    spawned.push(record);
    const worker: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage(request) {
        record.requests.push(request);
        const answer = (script.answer ?? ((source) => ({ result: { status: 'success', output: `<svg>${source}</svg>`, notes: [] } })))(request.molecules.map((m) => m.smiles).join('\n'));
        if (answer === 'hang') return;
        setTimeout(() => { if (!record.terminated) send({ type: 'reply', id: request.id, ...answer }); }, 1);
      },
      terminate() { record.terminated = true; }
    };
    const send = (message: WorkerMessage) => worker.onmessage?.({ data: message });
    const start = script.start ?? 'ok';
    if (start !== 'silent') setTimeout(() => send(start === 'ok' ? { type: 'started' } : { type: 'failed', reason: 'OpenChemLib could not start' }), 1);
    return worker;
  };
  return { spawn, spawned };
}

test('renders through the worker, starting one engine eagerly', async () => {
  const { spawn, spawned } = workers();
  const host = createHost(spawn);
  assert.equal(spawned.length, 1);
  assert.deepEqual(await host.render(smiles('CCO')), { status: 'success', output: '<svg>CCO</svg>', notes: [] });
  assert.equal(spawned[0]!.requests[0]!.outputBytes, 4 * 1024 * 1024);
  host.dispose();
});

test('renders run one at a time, in order', async () => {
  let active = 0;
  let most = 0;
  const { spawn } = workers({
    answer: (source) => {
      active++;
      most = Math.max(most, active);
      setTimeout(() => { active--; }, 1);
      return { result: { status: 'success', output: source, notes: [] } };
    }
  });
  const host = createHost(spawn);
  const sources = Array.from({ length: 10 }, (_, i) => 'C'.repeat(i + 1));
  const results = await Promise.all(sources.map((source) => host.render(smiles(source))));
  assert.deepEqual(results.map((result) => result.status === 'success' && result.output), sources);
  assert.equal(most, 1);
  host.dispose();
});

test('a render past the budget times out, stops the worker, and the next render starts a fresh one', async () => {
  const { spawn, spawned } = workers({ answer: (source) => source === 'slow' ? 'hang' : { result: { status: 'success', output: 'ok', notes: [] } } });
  const host = createHost(spawn, { timeout: 200 });
  assert.deepEqual(await host.render(smiles('slow')), { status: 'timeout', budget: 200 });
  assert.equal(spawned[0]!.terminated, true);
  assert.equal((await host.render(smiles('fast'))).status, 'success');
  assert.equal(spawned.length, 2);
  host.dispose();
});

test('a reply marked discard is returned, and its engine is not used again', async () => {
  const { spawn, spawned } = workers({ answer: (source) => source === 'boom'
    ? { result: { status: 'failure', message: 'OpenChemLib stopped unexpectedly' }, discard: true }
    : { result: { status: 'success', output: 'ok', notes: [] } } });
  const host = createHost(spawn);
  assert.deepEqual(await host.render(smiles('boom')), { status: 'failure', message: 'OpenChemLib stopped unexpectedly' });
  assert.equal(spawned[0]!.terminated, true);
  assert.equal((await host.render(smiles('CCO'))).status, 'success');
  assert.equal(spawned.length, 2);
  host.dispose();
});

test('an engine that fails or never starts makes the render unavailable, and is retried next time', async () => {
  const failing = workers({ start: 'fail' });
  const host = createHost(failing.spawn);
  assert.deepEqual(await host.render(smiles('CCO')), { status: 'unavailable', reason: 'OpenChemLib could not start' });
  assert.equal(failing.spawned[0]!.terminated, true);
  await host.render(smiles('CCO'));
  assert.equal(failing.spawned.length, 2);
  host.dispose();

  const silent = workers({ start: 'silent' });
  const stuck = createHost(silent.spawn, { startupTimeout: 20 });
  assert.deepEqual(await stuck.render(smiles('CCO')), { status: 'unavailable', reason: 'OpenChemLib did not start within 20 ms' });
  stuck.dispose();
});

test('the source and line limits, and an empty source, are checked before the worker sees anything', async () => {
  const { spawn, spawned } = workers();
  const host = createHost(spawn, { limits: { sourceChars: 12, lineChars: 5 } });
  assert.deepEqual(await host.render(smiles('CCCCCCCCCCCCC')), { status: 'failure', message: 'smiles source exceeds the 12-character limit' });
  assert.deepEqual(await host.render({ source: 'CC\nCCCCCC', notation: 'smarts' }), { status: 'failure', message: 'smarts line exceeds the 5-character limit', line: 2 });
  assert.deepEqual(await host.render(smiles(' \n ')), { status: 'failure', message: 'the fence contains no molecule' });
  assert.deepEqual(await host.render({ source: '', notation: 'smarts' }), { status: 'failure', message: 'the fence contains no pattern' });
  assert.equal(spawned[0]!.requests.length, 0);
  assert.equal((await host.render(smiles('CCO'))).status, 'success');
  host.dispose();
});

test('the worker gets the library\'s request: molecules with 1-based columns, the digest prefix, the output limit', async () => {
  const { spawn, spawned } = workers();
  const host = createHost(spawn);
  await host.render({ source: 'CCO ethanol\n\n  C1CC', notation: 'smarts' });
  const request = spawned[0]!.requests[0]!;
  assert.deepEqual(request.molecules, [
    { smiles: 'CCO', label: 'ethanol', line: 1, column: 1 },
    { smiles: 'C1CC', line: 3, column: 3 }
  ]);
  assert.equal(request.notation, 'smarts');
  const digest = createHash('sha256').update('smarts\0CCO ethanol\n\n  C1CC').digest('hex');
  assert.equal(request.prefix, `smiles-${digest.slice(0, 8)}-`);
  assert.equal(request.outputBytes, 4 * 1024 * 1024);
  host.dispose();
});

test('the digest is node:crypto\'s sha256', () => {
  for (const text of ['', 'abc', 'smiles\0CCO', 'x'.repeat(55), 'x'.repeat(64), '\u00e9\u2603\u{1F600}'.repeat(40)]) {
    assert.equal(sha256(text), createHash('sha256').update(text).digest('hex'), JSON.stringify(text));
  }
});

test('dispose stops the worker and settles renders in flight and queued as unavailable', async () => {
  const { spawn, spawned } = workers({ answer: () => 'hang' });
  const host = createHost(spawn, { timeout: 60000 });
  const pending: Promise<RenderResult>[] = [host.render(smiles('a')), host.render(smiles('b'))];
  await new Promise((resolve) => setTimeout(resolve, 10));
  host.dispose();
  const stopped = { status: 'unavailable', reason: 'the renderer was stopped' };
  assert.deepEqual(await Promise.all(pending), [stopped, stopped]);
  assert.equal(spawned[0]!.terminated, true);
  assert.deepEqual(await host.render(smiles('c')), stopped);
  assert.equal(spawned.length, 1);
});

test('options are validated as the library validates them', () => {
  const { spawn } = workers();
  for (const options of [{ timeout: 0 }, { timeout: Number.NaN }, { startupTimeout: -1 }, { limits: { sourceChars: Infinity } }, { limits: { outputBytes: 0 } }, { limits: { lineChars: -1 } }, { limits: null }, null]) {
    assert.throws(() => createHost(spawn, options as never), TypeError, JSON.stringify(options));
  }
  const host = createHost(spawn);
  for (const input of [42, null, { source: 1, notation: 'smiles' }, { source: 'C', notation: 'smi' }]) {
    assert.throws(() => host.render(input as unknown as RenderInput), TypeError, JSON.stringify(input));
  }
  host.dispose();
});
