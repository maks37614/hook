import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/components/replay/ReplayTradeHistoryPreview.tsx', import.meta.url), 'utf8');
test('historical trade chart does not create live subscriptions or render future data', () => {
  assert.match(source, /<HookChart klines=\{candles\}/);
  assert.match(source, /replay replayReview onTimeframeChange=\{setTimeframe\}/);
  assert.match(source, /trade\.exitTime \* 1000, 260, 0/);
  assert.match(source, /result\.allCandles\.slice\(0, result\.cutoffIndex \+ 1\)/);
  assert.match(source, /candle\.time <= trade\.exitTime/);
  assert.match(source, /\/api\/replay\/cached-history\?/);
  assert.match(source, /valid\.length >= 15/);
  assert.match(source, /processCandlesForCutoff/);
  assert.doesNotMatch(source, /\b(WebSocket|EventSource|setInterval)\b/);
  for (const lang of ['uk','en','pl','ru']) assert.ok(source.includes('  ' + lang + ': { loading:'));
});
