import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTimeout, readSettings, timeoutMs } from '../src/settings';

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

test('a timeout outside 0.5 to 60 seconds is refused with a reason', () => {
  for (const ok of [0.5, 3, 60]) assert.equal(checkTimeout(ok), undefined, String(ok));
  for (const bad of [0.4, 61, Number.NaN]) assert.equal(checkTimeout(bad), 'Enter a number of seconds from 0.5 to 60.', String(bad));
});
