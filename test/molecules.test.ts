import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMolecules } from '../src/molecules';

test('one non-blank line is one unlabelled molecule, whitespace trimmed, its place recorded', () => {
  assert.deepEqual(parseMolecules('  CCO  \n'), [{ smiles: 'CCO', line: 1, offset: 2 }]);
});

test('text after the first whitespace labels the molecule, as in .smi files', () => {
  assert.deepEqual(parseMolecules('CCO ethanol\nc1ccccc1\tbenzene  ring'), [
    { smiles: 'CCO', label: 'ethanol', line: 1, offset: 0 },
    { smiles: 'c1ccccc1', label: 'benzene  ring', line: 2, offset: 0 }
  ]);
});

test('blank lines and Windows line endings are skipped, and still count as lines', () => {
  assert.deepEqual(parseMolecules('\r\nCCO\r\n\r\n  \r\n\tCCC\r\n'), [
    { smiles: 'CCO', line: 2, offset: 0 },
    { smiles: 'CCC', line: 5, offset: 1 }
  ]);
});

test('an empty fence has no molecules', () => {
  assert.deepEqual(parseMolecules(''), []);
  assert.deepEqual(parseMolecules('\n  \n'), []);
});
