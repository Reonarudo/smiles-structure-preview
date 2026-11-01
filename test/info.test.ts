import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locate, scanFences } from '../src/info';

const W = ['smiles', 'smarts'];

test('finds smiles fences with their line, info string and body', () => {
  const text = '# T\n\n```smiles {caption="c"}\nCCO\nCCN\n```\n\ntext\n\n~~~smiles\nc1ccccc1\n~~~\n';
  assert.deepEqual(scanFences(text, W), [
    { line: 2, word: 'smiles', info: 'smiles {caption="c"}', body: 'CCO\nCCN' },
    { line: 9, word: 'smiles', info: 'smiles', body: 'c1ccccc1' }
  ]);
});

test('only the first word of the info string names the language, as in Obsidian', () => {
  const text = '```Smiles\na\n```\n```smiles2\nb\n```\n```smiles extra\nc\n```\n``` smiles\nd\n```';
  assert.deepEqual(scanFences(text, W).map((f) => f.body), ['c', 'd']);
});

test('a smiles fence quoted inside another fence is not a fence', () => {
  const text = '````markdown\n```smiles\nCCO\n```\n````\n\n```smiles\nreal\n```';
  assert.deepEqual(scanFences(text, W).map((f) => f.body), ['real']);
});

test('a closing fence must use the same character and be at least as long', () => {
  const text = '````smiles\nCCO\n```\n~~~~\n````\n';
  assert.deepEqual(scanFences(text, W), [{ line: 0, word: 'smiles', info: 'smiles', body: 'CCO\n```\n~~~~' }]);
});

test('a backtick fence whose info contains a backtick is not a fence', () => {
  assert.deepEqual(scanFences('```smiles `x`\nCCO\n```', W), []);
});

test('an unclosed fence runs to the end of the note', () => {
  assert.deepEqual(scanFences('```smiles\nCCO\nCCN', W), [{ line: 0, word: 'smiles', info: 'smiles', body: 'CCO\nCCN' }]);
});

test('fences in blockquotes and list items lose their container prefix', () => {
  const quoted = '> ```smiles {alt="q"}\n> CCO\n> ```\n';
  assert.deepEqual(scanFences(quoted, W), [{ line: 0, word: 'smiles', info: 'smiles {alt="q"}', body: 'CCO' }]);
  const nested = '- item\n\n    ```smiles\n    CCO\n      indented\n    ```\n';
  assert.deepEqual(scanFences(nested, W), [{ line: 2, word: 'smiles', info: 'smiles', body: 'CCO\n  indented' }]);
  // Leaving the blockquote closes the fence.
  assert.deepEqual(scanFences('> ```smiles\n> CCO\nafter', W), [{ line: 0, word: 'smiles', info: 'smiles', body: 'CCO' }]);
});

test('CRLF line endings are handled', () => {
  assert.deepEqual(scanFences('```smiles\r\nCCO\r\n```\r\n', W), [{ line: 0, word: 'smiles', info: 'smiles', body: 'CCO' }]);
});

test('locate picks the fence in the section, or the matching body when a section holds several', () => {
  const fences = scanFences('```smiles\na\n```\n- x\n  ```smiles\n  b\n  ```\n- y\n  ```smiles\n  c\n  ```\n', W);
  assert.equal(locate(fences, 0, 2, 'a', 'smiles'), 0);
  assert.equal(locate(fences, 3, 10, 'c\n', 'smiles'), 2);
  assert.equal(locate(fences, 3, 10, 'b', 'smiles'), 1);
  // No body matches: the first in range.
  assert.equal(locate(fences, 3, 10, 'zzz', 'smiles'), 1);
  assert.equal(locate(fences, 20, 30, 'a', 'smiles'), -1);
});

test('smiles and smarts fences share one list, in document order; smi and other words are not in it', () => {
  const text = '```smarts\n[#6]\n```\n```smi\nCCO\n```\n```smiles\nCCO\n```\n```SMILES\nC\n```\n```smarts {caption="c"}\nCCO\n```';
  assert.deepEqual(scanFences(text, W).map((f) => [f.word, f.body]), [['smarts', '[#6]'], ['smiles', 'CCO'], ['smarts', 'CCO']]);
});

test('locate only considers fences of the processor\'s own language', () => {
  // One section (a list item) holding a smiles and a smarts fence with the same body.
  const fences = scanFences('- a\n  ```smiles\n  CCO\n  ```\n  ```smarts\n  CCO\n  ```\n', W);
  assert.equal(locate(fences, 0, 6, 'CCO', 'smiles'), 0);
  assert.equal(locate(fences, 0, 6, 'CCO', 'smarts'), 1);
  assert.equal(locate(fences, 0, 0, 'CCO', 'smarts'), -1);
});
