import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/components/ReplayPage.tsx', import.meta.url), 'utf8');

test('changing replay market or historic date never silently drops an active account position', () => {
  assert.match(page, /const canChangeReplayHistory = \(\) => \{/);
  assert.match(page, /if \(!position && pendingOrders\.length === 0\) return true/);
  for (const handler of ['handleSelectCoin', 'handleTimeframeChange', 'handleRandomHistoricalDate', 'handleResetToCutoff']) {
    const start = page.indexOf('const ' + handler + ' =');
    assert.ok(start > 0, handler);
    const next = page.slice(start, start + 240);
    assert.match(next, /if \([^;]*canChangeReplayHistory\(\)\) return;/);
  }
  assert.match(page, /onSelectHistoricalDate=\{\(d\) => \{\s*if \(canChangeReplayHistory\(\)\) void loadHistoryForDate\(/);
  for (const lang of ['uk','en','pl','ru']) {
    assert.ok(page.includes('      ' + lang + ": ['"), lang + ': missing navigation guard translation');
  }
});
test('restoring saved Replay profile bypasses the manual navigation guard only', () => {
  assert.match(page, /restoredContext\.timeframe, false, true\)/);
  assert.match(page, /if \(!restoringProfile\) \{\s*setPosition\(null\);\s*setPendingOrders\(\[\]\);/);
});
