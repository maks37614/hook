import test from 'node:test';
import assert from 'node:assert/strict';
import type { Kline } from '../src/types';
import { calculatePOC } from '../server/estimatedPoc';
import { readFileSync } from 'node:fs';

const bar = (close: number, time: number, volume = 100): Kline => ({
  time, open: close - 5, close, high: close + 10, low: close - 15,
  volume,
});

test('estimated 24h POC is within the same 24 hourly candle high/low, even if past market was far higher', () => {
  const past = Array.from({ length: 196 }, (_, i) => bar(73_800, 1793900000 + i * 3600, 8000));
  const last24 = Array.from({ length: 24 }, (_, i) => bar(66_800 + i * 50, 1794600000 + i * 3600, 100));
  const allBars = [...past, ...last24];
  const oldPoc = calculatePOC(allBars).pocPrice;
  const dayPoc = calculatePOC(last24).pocPrice;
  const low24h = Math.min(...last24.map(b => b.low));
  const high24h = Math.max(...last24.map(b => b.high));
  assert.ok(oldPoc !== null && oldPoc > high24h, 'old long-lookback POC can sit above 24h high');
  assert.ok(dayPoc !== null && dayPoc >= low24h && dayPoc <= high24h);
  const service = readFileSync(new URL('../server/smartAnalysisService.ts', import.meta.url),'utf8');
  assert.match(service, /calculatePOC\(has24h \? closedHours : \[\]\)/);
  assert.match(service, /valid24hWindow/);
  assert.match(service, /closedHours\.every\(\(bar, i\)/);
});

test('no fabricated candle POC for stale, empty, malformed or zero-volume data', () => {
  const small = Array.from({ length: 9 }, (_, i) => bar(100 + i, i * 3600));
  assert.deepEqual(calculatePOC(small), { pocPrice: null, pocVolumePct: null });
  const zero = Array.from({ length: 24 }, (_, i) => bar(100 + i, i * 3600, 0));
  assert.deepEqual(calculatePOC(zero), { pocPrice: null, pocVolumePct: null });
  const broken = Array.from({ length: 24 }, (_, i) => ({ ...bar(100 + i, i * 3600), low: NaN }));
  assert.deepEqual(calculatePOC(broken), { pocPrice: null, pocVolumePct: null });
});
