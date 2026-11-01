// The toggle's pure core, ported from smiles-markdown-preview's media/preview.js with its tables
// unchanged, and the store that keeps it in the plugin's data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/toggle';
import { ToggleStore, type Entry, type Storage } from '../src/toggle';

const memory = (): Storage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); }
  };
};
const throwing: Storage = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('SecurityError'); },
  removeItem: () => { throw new Error('SecurityError'); }
};

test('match: key first, then ordinal within the key group, then the same index among all fences', () => {
  const table: [string, Entry[], string[], number[]][] = [
    ['key present picks the ordinal within its group', [{ key: 'a', ordinal: 1, index: 0 }], ['a', 'b', 'a'], [2]],
    ['two identical bodies flipped independently', [{ key: 's', ordinal: 1, index: 1 }], ['s', 's'], [1]],
    ['both identical bodies flipped', [{ key: 's', ordinal: 0, index: 0 }, { key: 's', ordinal: 1, index: 1 }], ['s', 's'], [0, 1]],
    ['a key gone from the document falls back to the fence at the same index', [{ key: 'old', ordinal: 0, index: 2 }], ['a', 'b', 'c'], [2]],
    ['an index beyond the document drops the entry', [{ key: 'old', ordinal: 0, index: 5 }], ['a'], []],
    ['an ordinal beyond the key group drops the entry', [{ key: 'a', ordinal: 2, index: 0 }], ['a', 'a'], []],
    ['a fence inserted above a flipped one keeps the flip on the right fence', [{ key: 'b', ordinal: 0, index: 1 }], ['n', 'a', 'b'], [2]],
    ['a fence removed above a flipped one keeps the flip on the right fence', [{ key: 'b', ordinal: 0, index: 2 }], ['a', 'b'], [1]],
    ['nothing flipped matches nothing', [], ['a', 'b'], []],
    ['no fences left matches nothing', [{ key: 'a', ordinal: 0, index: 0 }], [], []]
  ];
  for (const [name, entries, keys, expected] of table) assert.deepEqual(core.match(entries, keys), expected, name);
});

test('collect describes only real fences, with ordinal and index recomputed from the document', () => {
  assert.deepEqual(core.collect(['a', 'b', 'a', 'c'], new Set([2, 3])), [
    { key: 'a', ordinal: 1, index: 2 },
    { key: 'c', ordinal: 0, index: 3 }
  ]);
  assert.deepEqual(core.collect(['a', 'b'], [7]), []);
  assert.deepEqual(core.collect([], [0]), []);
  // After a fallback match, collect re-keys the entry to the fence it now sits on.
  const after = ['x', 'y', 'z'];
  const flipped = core.match([{ key: 'old', ordinal: 0, index: 1 }], after);
  assert.deepEqual(core.collect(after, flipped), [{ key: 'y', ordinal: 0, index: 1 }]);
});

test('storageKey names the extension and the document', () => {
  assert.equal(core.storageKey('smiles', 'file:///notes/model.md'), 'smiles-markdown-preview.view-toggle:file:///notes/model.md');
});

test('save writes the entries, removes the key when nothing is flipped, and load reads them back', () => {
  const storage = memory();
  const entries = [{ key: 'a', ordinal: 0, index: 0 }];
  core.save(storage, 'k', entries);
  assert.equal(storage.map.get('k'), JSON.stringify(entries));
  assert.deepEqual(core.load(storage, 'k'), entries);
  core.save(storage, 'k', []);
  assert.equal(storage.map.has('k'), false);
  assert.deepEqual(core.load(storage, 'k'), []);
});

test('load ignores a missing, corrupt or wrongly shaped value', () => {
  const storage = memory();
  assert.deepEqual(core.load(storage, 'k'), []);
  storage.map.set('k', '{not json');
  assert.deepEqual(core.load(storage, 'k'), []);
  storage.map.set('k', '{"key":"a"}');
  assert.deepEqual(core.load(storage, 'k'), []);
});

test('a storage that throws degrades to memory-only: load is empty and save does not throw', () => {
  assert.deepEqual(core.load(throwing, 'k'), []);
  assert.doesNotThrow(() => core.save(throwing, 'k', [{ key: 'a', ordinal: 0, index: 0 }]));
  assert.doesNotThrow(() => core.save(throwing, 'k', []));
});

test('the store reads entries from plugin data, ignoring anything that is not a list', () => {
  const store = new ToggleStore({ 'a.md': [{ key: 'k', ordinal: 0, index: 0 }], 'b.md': 'junk' }, () => {});
  assert.equal(store.isFlipped('a.md', ['k'], 0), true);
  assert.deepEqual({ ...store.toJSON() }, { 'a.md': [{ key: 'k', ordinal: 0, index: 0 }] });
  for (const junk of [null, undefined, 'x', 3, []]) assert.deepEqual({ ...new ToggleStore(junk, () => {}).toJSON() }, {});
});

test('set flips one fence among identical bodies, re-keys, and reports each change', () => {
  let changes = 0;
  const store = new ToggleStore({}, () => { changes++; });
  store.set('n.md', ['s', 's', 't'], 1, true);
  assert.deepEqual({ ...store.toJSON() }, { 'n.md': [{ key: 's', ordinal: 1, index: 1 }] });
  assert.equal(store.isFlipped('n.md', ['s', 's', 't'], 0), false);
  assert.equal(store.isFlipped('n.md', ['s', 's', 't'], 1), true);
  // A fence inserted above keeps the flip on the same body.
  assert.equal(store.isFlipped('n.md', ['new', 's', 's', 't'], 2), true);
  store.set('n.md', ['s', 's', 't'], 1, false);
  assert.deepEqual({ ...store.toJSON() }, {});
  assert.equal(changes, 2);
});

test('notes are kept apart, follow a rename, and clear forgets them', () => {
  const store = new ToggleStore({}, () => {});
  store.set('a.md', ['k'], 0, true);
  store.set('b.md', ['k'], 0, true);
  store.rename('a.md', 'folder/a.md');
  assert.equal(store.isFlipped('a.md', ['k'], 0), false);
  assert.equal(store.isFlipped('folder/a.md', ['k'], 0), true);
  store.clear('b.md');
  assert.deepEqual(Object.keys(store.toJSON()), ['folder/a.md']);
  store.rename('missing.md', 'x.md');
  assert.deepEqual(Object.keys(store.toJSON()), ['folder/a.md']);
});

test('a note path that is also an Object.prototype name is stored as data', () => {
  const store = new ToggleStore({}, () => {});
  assert.equal(store.isFlipped('constructor', ['k'], 0), false);
  store.set('__proto__', ['k'], 0, true);
  assert.equal(store.isFlipped('__proto__', ['k'], 0), true);
});

test('the stored data survives a JSON round trip, as saveData does', () => {
  const store = new ToggleStore({}, () => {});
  store.set('__proto__', ['k'], 0, true);
  store.set('a.md', ['k'], 0, true);
  const reloaded = new ToggleStore(JSON.parse(JSON.stringify(store.toJSON())), () => {});
  assert.equal(reloaded.isFlipped('__proto__', ['k'], 0), true);
  assert.equal(reloaded.isFlipped('a.md', ['k'], 0), true);
});
