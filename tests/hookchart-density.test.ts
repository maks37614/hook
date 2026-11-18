import test from 'node:test';
import assert from 'node:assert/strict';
import { filterOrderBookDensities, getOrderBookDensityLevels, normalizeDensityDistance } from '../src/components/hookchart/marketAnalytics';
import { HookChartDensityBook } from '../src/components/hookchart/densityBook';
import { BinanceOrderBookSync } from '../src/utils/binanceOrderBook';
import { ORDER_BOOK_MAX_AGE_MS } from '../src/utils/orderBookValidation';
import type { HookChartPreferences } from '../src/types';

const manual: HookChartPreferences = { densityMode: 'manual', densityThreshold: 100_000, densityDiffPct: 5 };
const now = Date.now();
const snapshot = () => ({ isSnapshot: true, sequence: 100,
  bids: [[99.9, 1], [99, 2000], [95, 2000]] as [number, number][],
  asks: [[100.1, 1], [101, 2000], [105, 2000]] as [number, number][],
});

test('HookChart manual threshold filters live exchange depth by each price level USD notional', () => {
  // Binance and Bybit public depth feeds both represent each level as [price, base quantity].
  const bids: [string, string][] = [['100', '2000'], ['99', '1000'], ['94', '100000'], ['101', '1000']];
  const asks: [string, string][] = [['101', '1000'], ['102', '1700'], ['106', '100000']];

  const scoped = getOrderBookDensityLevels(bids, asks, 100, 5);
  assert.deepEqual(scoped.map(level => [level.side, level.p, level.usd]), [
    ['BID', 100, 200_000],
    ['BID', 99, 99_000],
    ['ASK', 101, 101_000],
    ['ASK', 102, 173_400],
  ]);

  assert.deepEqual(filterOrderBookDensities(scoped, 150_000).map(level => [level.side, level.p, level.usd]), [
    ['BID', 100, 200_000],
    ['ASK', 102, 173_400],
  ]);
  assert.equal(filterOrderBookDensities(scoped, 200_000)[0].p, 100, 'the exact threshold is included');
});

test('HookChart ignores invalid levels and does not combine nearby price levels into a fake density', () => {
  const levels = getOrderBookDensityLevels(
    [['100', '700'], ['99.9', '800'], ['0', '5000'], ['99', 'NaN']],
    [],
    100,
    5,
  );
  assert.equal(levels.length, 2);
  assert.deepEqual(filterOrderBookDensities(levels, 100_000), []);
});

test('distance is inclusive on both sides and follows the current midpoint', () => {
  const book = new HookChartDensityBook();
  assert.equal(book.apply(snapshot(), now), true);
  assert.deepEqual(book.read({ ...manual, densityDiffPct: 1 }, 0, now).densities.map(d => d.p).sort((a, b) => a - b), [99, 101]);
  assert.equal(book.read({ ...manual, densityDiffPct: .5 }, 0, now).densities.length, 0);
  assert.equal(book.read(manual, 0, now).densities.length, 4);
  book.apply({ sequence: 101, bids: [[99.9, 0], [99, 0], [95, 0], [103.9, 1], [103, 2000]],
    asks: [[100.1, 0], [101, 0], [104.1, 1]] }, now + 1);
  const moved = book.read({ ...manual, densityDiffPct: 1 }, 0, now + 1);
  assert.equal(moved.price, 104);
  assert.deepEqual(moved.densities.map(d => d.p).sort((a, b) => a - b), [103, 105]);
});

test('distance preference uses the same finite 0.1–20 percent bounds everywhere', () => {
  assert.equal(normalizeDensityDistance(undefined), 5);
  assert.equal(normalizeDensityDistance(NaN), 5);
  assert.equal(normalizeDensityDistance(Infinity), 5);
  assert.equal(normalizeDensityDistance(-2), .1);
  assert.equal(normalizeDensityDistance(100), 20);
  assert.equal(normalizeDensityDistance(.75), .75);
});

test('threshold and distance edits immediately remove old densities without another exchange tick', () => {
  const book = new HookChartDensityBook();
  book.apply(snapshot(), now);
  assert.equal(book.read(manual, 0, now).densities.length, 4);
  assert.equal(book.read({ ...manual, densityThreshold: 205_000 }, 0, now).densities.length, 1);
  assert.equal(book.read({ ...manual, densityDiffPct: .5 }, 0, now).densities.length, 0);
  assert.equal(book.read({ ...manual, densityAnalysis: false }, 0, now).densities.length, 0);
});

test('zero quantity and reductions below threshold disappear on the very next book update', () => {
  const book = new HookChartDensityBook();
  book.apply(snapshot(), now);
  const previous = book.read(manual, 0, now);
  book.apply({ sequence: 101, bids: [[99, 0]], asks: [[101, 1]] }, now + 1);
  const current = book.read(manual, 0, now + 1);
  assert.deepEqual(current.densities.map(d => d.p).sort((a, b) => a - b), [95, 105]);
  assert.equal(previous.densities.find(d => d.p === 101)?.q, 2000, 'published React state is not mutated later');
  assert.ok(current.densities.every(d => d.active));
});

test('search uses the complete received book and displays more than four qualifying orders per side', () => {
  const book = new HookChartDensityBook();
  book.apply({ isSnapshot: true, sequence: 1,
    bids: Array.from({ length: 50 }, (_, i) => [99.9 - i * .05, 2000] as [number, number]),
    asks: [[100.1, 1]] }, now);
  const state = book.read(manual, 0, now);
  assert.equal(state.book.b.length, 40);
  assert.equal(state.densities.length, 50);
  assert.equal(state.densities.at(-1)?.usd, state.densities.at(-1)!.p * 2000);
});

test('stale, disconnected and resynchronizing books publish no old densities', () => {
  const book = new HookChartDensityBook();
  book.apply(snapshot(), now);
  assert.equal(book.read(manual, 0, now).depthReady, true);
  const stale = book.read(manual, 0, now + ORDER_BOOK_MAX_AGE_MS + 1);
  assert.equal(stale.depthReady, false);
  assert.deepEqual(stale.densities, []);
  assert.deepEqual(stale.book, { b: [], a: [] });
  assert.equal(book.apply({ sequence: 101, bids: [[99, 9999]], asks: [] }, now + 6000), false, 'a fresh snapshot is required after stale data');
  book.apply(snapshot(), now + 6001);
  book.clear();
  assert.deepEqual(book.read(manual, 0, now + 6001).densities, []);
});

test('malformed, old, empty-sided and crossed books are never shown as real liquidity', () => {
  const invalid = [
    { ...snapshot(), bids: [[99, -1]] as [number, number][] },
    { ...snapshot(), asks: [[NaN, 2000]] as [number, number][] },
    { ...snapshot(), asks: [] },
    { ...snapshot(), bids: [[110, 2000]] as [number, number][] },
    { ...snapshot(), eventTime: now - ORDER_BOOK_MAX_AGE_MS - 1 },
  ];
  for (const update of invalid) {
    const book = new HookChartDensityBook();
    book.apply(snapshot(), now);
    assert.equal(book.apply(update, now), false);
    assert.equal(book.read(manual, 0, now).depthReady, false);
    assert.deepEqual(book.read(manual, 0, now).densities, []);
  }
});

test('Bybit snapshot replacement, restart and duplicate update do not retain deleted orders', () => {
  const book = new HookChartDensityBook();
  assert.equal(book.apply({ sequence: 99, bids: [[99, 2000]], asks: [] }, now), false);
  book.apply(snapshot(), now);
  book.apply({ sequence: 99, bids: [[99, 9999]], asks: [] }, now + 1);
  assert.equal(book.read(manual, 0, now + 1).densities.find(d => d.p === 99)?.q, 2000);
  book.apply({ isSnapshot: true, sequence: 1, bids: [[99.9, 1]], asks: [[100.1, 1]] }, now + 2);
  assert.deepEqual(book.read(manual, 0, now + 2).densities, []);
});

test('minimum holding time is continuous and starts over after a removed wall returns', () => {
  const book = new HookChartDensityBook();
  const settings = { ...manual, densityTimeoutMin: 2 / 60 };
  book.apply(snapshot(), now);
  assert.equal(book.read(settings, 0, now).densities.length, 0);
  assert.equal(book.read(settings, 0, now + 2000).densities.length, 4);
  book.apply({ sequence: 101, bids: [[99, 0]], asks: [] }, now + 2100);
  assert.equal(book.read(settings, 0, now + 2100).densities.some(d => d.p === 99), false);
  book.apply({ sequence: 102, bids: [[99, 2000]], asks: [] }, now + 2200);
  assert.equal(book.read(settings, 0, now + 2200).densities.some(d => d.p === 99), false);
  assert.equal(book.read(settings, 0, now + 4200).densities.some(d => d.p === 99), true);
});

test('AUTO recalculates immediately when its multiplier changes', () => {
  const book = new HookChartDensityBook();
  book.apply(snapshot(), now);
  const auto = { densityMode: 'auto', densityDiffPct: 5 } as const;
  const first = book.read(auto, 0, now).densityCut;
  assert.equal(book.read({ ...auto, densityAutoMultiplier: 2 }, 0, now).densityCut, first * 2);
});

for (const market of ['spot', 'futures'] as const) {
  test(`Binance ${market} densities wait for a valid snapshot bridge and disappear on a sequence gap`, () => {
    const book = new HookChartDensityBook();
    let resyncs = 0;
    const sync = new BinanceOrderBookSync(market, update => { book.apply(update, now); }, () => { book.clear(); resyncs++; });
    sync.setSnapshot(snapshot());
    assert.equal(book.read(manual, 0, now).depthReady, false);
    sync.push({ U: 99, u: 102, ...(market === 'futures' ? { pu: 98 } : {}), b: [['99', '2100']], a: [] });
    assert.equal(book.read(manual, 0, now).densities.find(d => d.p === 99)?.usd, 207_900);
    sync.push({ U: 103, u: 104, ...(market === 'futures' ? { pu: 102 } : {}), b: [['99', '0']], a: [] });
    assert.equal(book.read(manual, 0, now).densities.some(d => d.p === 99), false);
    sync.push({ U: 109, u: 110, ...(market === 'futures' ? { pu: 108 } : {}), b: [['99', '9999']], a: [] });
    assert.equal(resyncs, 1);
    assert.deepEqual(book.read(manual, 0, now).densities, []);
    sync.setSnapshot({ ...snapshot(), sequence: market === 'futures' ? 109 : 108 });
    assert.equal(book.read(manual, 0, now).densities.find(d => d.p === 99)?.usd, 989_901);
  });
}
