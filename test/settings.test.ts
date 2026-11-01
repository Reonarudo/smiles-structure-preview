import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSettings, timeoutMs } from '../src/settings';

test('stored settings are read with defaults for anything missing or out of range', () => {
  assert.deepEqual(readSettings(undefined), { depictionTimeout: 3, followDarkTheme: true, debug: false });
  assert.deepEqual(readSettings({ depictionTimeout: 0.5, followDarkTheme: false, debug: true }), { depictionTimeout: 0.5, followDarkTheme: false, debug: true });
  for (const depictionTimeout of [0.4, 61, '5', Number.NaN, null]) {
    assert.equal(readSettings({ depictionTimeout }).depictionTimeout, 3, String(depictionTimeout));
  }
  // Following dark themes is on unless stored as exactly `false`.
  for (const followDarkTheme of ['false', 0, null]) {
    assert.equal(readSettings({ followDarkTheme }).followDarkTheme, true, String(followDarkTheme));
  }
});

test('the budget is the VS Code extension\'s: seconds clamped to 0.5 to 60, in whole milliseconds', () => {
  assert.equal(timeoutMs(3), 3000);
  assert.equal(timeoutMs(1.5), 1500);
  assert.equal(timeoutMs(0.1), 500);
  assert.equal(timeoutMs(600), 60000);
  assert.equal(timeoutMs(Number.NaN), 3000);
});
