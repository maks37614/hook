import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ReplayHistoryCache } from '../server/replayHistoryCache';
import { prependCachedReplayHistory, replayVisibleCandles } from '../src/utils/replayHistoryExtend';
import type { Kline } from '../src/types';

const H = 3600;
const BASE = 1_699_999_200; // aligned UTC 1h candle
const source = { exchange: 'binance', market: 'futures', symbol: 'BTCUSDT', timeframe: '1h' } as const;
const bar = (time: number): Kline => ({
  time, open: 100, high: 102, low: 99, close: 101, volume: 20,
});

test('cache reads already recorded past candles only, isolated by market', () => {
  const cache = new ReplayHistoryCache();
  const now = (BASE + 20 * H) * 1000;
  cache.record(source, [bar(BASE), bar(BASE + H), bar(BASE + 2 * H), bar(BASE + 20 * H)], now);
  const older = cache.olderThan(source, BASE + 2 * H, 10, now);
  assert.deepEqual(older.map(c => c.time), [BASE, BASE + H]);
  assert.equal(cache.olderThan({ ...source, exchange: 'bybit' }, BASE + 4 * H, 10, now).length, 0);
  assert.equal(cache.olderThan({ ...source, market: 'spot' }, BASE + 4 * H, 10, now).length, 0);
  assert.equal(cache.olderThan({ ...source, timeframe: '5m' }, BASE + 4 * H, 10, now).length, 0);
  // Latest unfinished candle was deliberately discarded.
  // No immediate predecessor means there is no usable prefix, even when
  // much older non-contiguous candles exist elsewhere in the shared cache.
  assert.deepEqual(cache.olderThan(source, BASE + 21 * H, 10, now), []);
});

test('per-market history, global memory and retention have firm bounds', () => {
  const cache = new ReplayHistoryCache();
  const now = (BASE + 2100 * H) * 1000;
  const many = Array.from({ length: 2000 }, (_, i) => bar(BASE + i * H));
  cache.record(source, many, now);
  const stored = cache.olderThan(source, BASE + 2000 * H, 3000, now);
  assert.equal(stored.length, 1800);
  assert.equal(stored[0].time, BASE + 200 * H);
  assert.equal(stored.at(-1)!.time, BASE + 1999 * H);
  for (let i = 0; i < 22; i++) {
    cache.record({ ...source, symbol: 'SYM' + i + 'USDT' }, many, now);
  }
  assert.ok(cache.stats().candles <= cache.stats().maxCandles);
  assert.ok(cache.stats().series <= 48);
  assert.deepEqual(cache.olderThan(source, BASE + 2000 * H, 1, now + 2 * 3600_000 + 1), []);
});

test('cache never stores invalid, misaligned or still-open OHLCV', () => {
  const cache = new ReplayHistoryCache();
  const now = (BASE + 5 * H) * 1000;
  cache.record(source, [
    bar(BASE), bar(BASE + 5 * H), bar(BASE + 60),
    { ...bar(BASE + H), high: 1 },
    { ...bar(BASE + 2 * H), volume: -1 },
    { ...bar(BASE + 3 * H), close: Number.NaN },
  ], now);
  assert.deepEqual(cache.olderThan(source, BASE + 6 * H, 10, now), []);
  assert.deepEqual(cache.olderThan(source, BASE + H, 10, now).map(c => c.time), [BASE]);
});

test('cache-only history returns strictly adjacent candles and never serializes distant sparse pages', () => {
  const cache = new ReplayHistoryCache();
  const now = (BASE + 500 * H) * 1000;
  cache.record(source, [
    ...Array.from({ length: 100 }, (_, i) => bar(BASE + i * H)),
    bar(BASE + 300 * H),
    bar(BASE + 301 * H),
    bar(BASE + 400 * H),
  ], now);
  assert.deepEqual(cache.olderThan(source, BASE + 302 * H, 1800, now).map(c => c.time),
    [BASE + 300 * H, BASE + 301 * H]);
  assert.deepEqual(cache.olderThan(source, BASE + 300 * H, 1800, now), [],
    'distant cache blocks are not useful if there is a gap before replay');
  assert.deepEqual(cache.olderThan(source, BASE + 98 * H, 2, now).map(c => c.time),
    [BASE + 96 * H, BASE + 97 * H]);
  assert.deepEqual(cache.olderThan(source, BASE + 2 * H + 60, 10, now).map(c => c.time),
    [BASE, BASE + H, BASE + 2 * H]);
});

test('invalid archive records do not extend expiry for old candles', () => {
  const cache = new ReplayHistoryCache();
  const now = (BASE + 20 * H) * 1000;
  cache.record(source, [bar(BASE)], now);
  const later = now + 90 * 60_000;
  cache.record(source, [
    bar(BASE + 30 * H), // still open at this instant
    { ...bar(BASE + H), volume: -10 },
  ], later);
  assert.equal(cache.olderThan(source, BASE + H, 10, now + 2 * 3_600_000 + 1).length, 0,
    'only accepted and confirmed bars may refresh retention');
});

test('cache prefix keeps selected candle, replay progress and future mask unchanged', () => {
  const current = [bar(BASE + 2 * H), bar(BASE + 3 * H), bar(BASE + 4 * H)];
  const fetched = [bar(BASE), bar(BASE + H), bar(BASE + 2 * H), bar(BASE - 10 * H)];
  const { candles, added } = prependCachedReplayHistory(current, fetched, '1h');
  assert.equal(added, 2);
  assert.deepEqual(candles.map(c => c.time), [
    BASE, BASE + H, BASE + 2 * H, BASE + 3 * H, BASE + 4 * H,
  ]);
  // currentIndex = cutoffIndex = 1 becomes 3. Same real candle remains selected.
  const currentIndex = 1 + added;
  assert.equal(candles[currentIndex].time, current[1].time);
  assert.equal(candles.slice(0, currentIndex + 1).at(-1)!.time, current[1].time);
  assert.ok(candles[currentIndex + 1].time > current[1].time);
  assert.equal(prependCachedReplayHistory(current, [bar(BASE)], '1h').added, 0);
});


test('History viewport does not change playback indices or retain extra bars when collapsed', () => {
  const first = BASE + 2 * H;
  const replay = [bar(first), bar(first + H), bar(first + 2 * H), bar(first + 3 * H)];
  const earlier = [bar(BASE), bar(BASE + H)];
  const selectedIndex = 1;
  const original = replayVisibleCandles(replay, selectedIndex, false, earlier);
  const expanded = replayVisibleCandles(replay, selectedIndex, true, earlier);
  const closed = replayVisibleCandles(replay, selectedIndex, false, earlier);
  assert.deepEqual(original.map(c => c.time), [first, first + H]);
  assert.deepEqual(expanded.map(c => c.time),
    [BASE, BASE + H, first, first + H]);
  assert.deepEqual(closed, original,
    'collapsing History releases the extra bars from HookChart props');
  assert.equal(replay[selectedIndex].time, expanded.at(-1)?.time);
  assert.equal(replay.length, 4, 'Replay simulation always retains its original dataset');
  assert.ok(!expanded.some(c => c.time > replay[selectedIndex].time),
    'future replay bars remain masked even with extended chart history');
});

test('History view is disconnected from simulator indices and reuses cached prefix on reopen', () => {
  const replay = [bar(BASE + 3 * H), bar(BASE + 4 * H)];
  const cached = [bar(BASE), bar(BASE + H), bar(BASE + 2 * H)];
  assert.equal(replayVisibleCandles(replay, 0, true, cached).length, 4);
  assert.equal(replayVisibleCandles(replay, 0, false, cached).length, 1);
  assert.equal(replayVisibleCandles(replay, 0, true, cached).length, 4);
  assert.deepEqual(replayVisibleCandles([], 0, true, cached), []);
  const page = readFileSync('src/components/ReplayPage.tsx', 'utf8');
  const section = page.split('const toggleCachedHistory = useCallback')[1]?.split('const currentCandle =')[0];
  assert.ok(section);
  assert.match(section, /setCachedHistoryPrefix\(candles\.slice\(0, added\)\)/);
  assert.doesNotMatch(section, /set(AllCandles|CutoffIndex|CurrentIndex)\(/,
    'cache-only history mode must never mutate simulation state or total candle count');
  assert.match(page, /setCachedHistoryPrefix\(\[\]\)/);
});

test('Replay cached-history endpoint cannot trigger exchange REST requests', () => {
  const server = readFileSync('server.ts', 'utf8');
  const route = server.split("app.get('/api/replay/cached-history'")[1]?.split('// Klines endpoint for interactive chart')[0];
  assert.ok(route, 'cache-only Replay endpoint is present');
  assert.match(route, /replayHistoryCache\.olderThan/);
  assert.doesNotMatch(route, /\b(fetchKlines|fetchDirectKlines|fetchHistoricalReplayCandles|exchangeFetch)\s*\(/);
});
