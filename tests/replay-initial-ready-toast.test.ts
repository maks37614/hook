import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/ReplayPage.tsx', import.meta.url), 'utf8');

test('Replay initializes history silently without hiding user-initiated feedback', () => {
  assert.match(source, /async \(targetDate: Date, sym = symbol, ex = exchange, mkt = marketType, tf = timeframe,[\s\S]*?notifyReady = true, restoringProfile = false\)/);
  assert.match(source, /if \(notifyReady\)\s*\{\s*showToast\(\s*'info',\s*t\('replay\.history\.readyTitle'\)/);
  assert.match(source, /if \(!isReady \|\| initializedAccountRef\.current === ownerKey\) return/);
  assert.match(source, /const initial = getReplayStartingDefaults\(\)/);
  assert.match(source, /replayInitRef\.current\.loadHistoryForDate\(generateRandomHistoricalDate\(\), replayInitRef\.current\.symbol,\s*initial\.exchange, initial\.marketType, initial\.timeframe, false\)/);
  assert.match(source, /restoredContext\.timeframe, false, true/);
  assert.match(source, /onSelectHistoricalDate=\{\(d\) => \{\s*if \(canChangeReplayHistory\(\)\) void loadHistoryForDate\(d, symbol, exchange, marketType, timeframe\)/);
  assert.match(source, /setLoadError\(err.message \|\| t\('replay\.history\.loadError'\)\)/);
});
