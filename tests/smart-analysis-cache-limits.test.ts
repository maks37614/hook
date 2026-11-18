import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storeBoundedAnalysis } from '../server/boundedAnalysisCache';

test('smart analysis cache never grows past the configured instrument limit', () => {
  const cache = new Map<string, { timestamp: number; data: number }>();
  for (let index = 0; index < 900; index++) {
    storeBoundedAnalysis(cache, 'COIN' + index, index, {
      now: 1000, ttlMs: 15_000, maxEntries: 512,
    });
  }
  assert.equal(cache.size, 512);
  assert.equal(cache.has('COIN0'), false);
  assert.equal(cache.get('COIN899')?.data, 899);
});

test('expired smart analysis is evicted but a fresh result retains its original value', () => {
  const cache = new Map<string, { timestamp: number; data: { score: number } }>();
  storeBoundedAnalysis(cache, 'BTCUSDT', { score: 80 }, {
    now: 1000, ttlMs: 15_000, maxEntries: 3,
  });
  storeBoundedAnalysis(cache, 'ETHUSDT', { score: 70 }, {
    now: 2000, ttlMs: 15_000, maxEntries: 3,
  });
  storeBoundedAnalysis(cache, 'SOLUSDT', { score: 60 }, {
    now: 16000, ttlMs: 15_000, maxEntries: 3,
  });
  assert.equal(cache.has('BTCUSDT'), false, '15-second old record expires');
  assert.equal(cache.get('ETHUSDT')?.data.score, 70);
  assert.equal(cache.get('SOLUSDT')?.data.score, 60);

  // A fresh replacement takes one slot, never creating duplicate entries.
  storeBoundedAnalysis(cache, 'ETHUSDT', { score: 72 }, {
    now: 16001, ttlMs: 15_000, maxEntries: 3,
  });
  assert.equal(cache.size, 2);
  assert.equal(cache.get('ETHUSDT')?.data.score, 72);
});

test('supplied formation and candle history cannot borrow a different cached score', () => {
  const source = readFileSync(new URL('../server/smartAnalysisService.ts', import.meta.url), 'utf8');
  assert.match(source, /const shareable = !params\.formation && !params\.klines\?\.length/);
  assert.match(source, /const cached = shareable \? analysisCache\.get\(cacheKey\) : undefined/);
  assert.match(source, /if \(shareable\) \{\s*storeBoundedAnalysis\(analysisCache/);
  assert.match(source, /maxEntries: MAX_ANALYSIS_CACHE_ENTRIES/);
});
