import test from 'node:test';
import assert from 'node:assert/strict';
import { HookChartDensityBook } from '../src/components/hookchart/densityBook';
import type { BookUpdate } from '../src/utils/binanceOrderBook';

// Controlled books, not live quotes: price and liquidity vary independently.
const now = Date.now();
const auto = { densityMode: 'auto', densityDiffPct: 5 } as const;
function makeBook(price: number, typicalUsd: number, walls: Record<number, number> = {}, count = 60): BookUpdate {
  return {
    isSnapshot: true, sequence: 1,
    bids: Array.from({ length: count }, (_, i) => {
      const p = price * (1 - (i + 1) * .0005);
      return [p, (walls[i] ?? typicalUsd) / p];
    }),
    asks: Array.from({ length: count }, (_, i) => {
      const p = price * (1 + (i + 1) * .0005);
      return [p, typicalUsd / p];
    }),
  };
}

test('AUTO does not manufacture densities from a uniform ordinary order book', () => {
  const book = new HookChartDensityBook();
  book.apply(makeBook(100, 1000), now);
  const result = book.read(auto, 0, now);
  assert.ok(result.densityCut > 1000, 'ordinary levels must stay below the automatic threshold');
  assert.equal(result.densities.length, 0);
});

test('a huge wall cannot raise AUTO enough to hide another genuine outlier', () => {
  const book = new HookChartDensityBook();
  book.apply(makeBook(100, 1000, { 4: 10_000 }, 10), now);
  const first = book.read(auto, 0, now);
  assert.equal(first.densities.length, 1);
  book.apply({ sequence: 2, bids: [[98, 100_000_000 / 98]], asks: [] }, now + 1);
  const after = book.read(auto, 0, now + 5000);
  assert.equal(after.densities.length, 2, 'the original 10k wall still qualifies');
  assert.ok(Math.abs(after.densityCut - first.densityCut) <= 1, 'outliers do not set their own baseline');
});

test('AUTO can find an obvious wall in a shallow two-sided book', () => {
  const book = new HookChartDensityBook();
  book.apply({ isSnapshot: true, sequence: 1, bids: [[99.9, 100 / 99.9]], asks: [[100.1, 10_000 / 100.1]] }, now);
  const result = book.read(auto, 0, now);
  assert.equal(result.densities.length, 1);
  assert.equal(result.densities[0].side, 'ASK');
  assert.ok(result.densityCut < 10_000);
});

test('AUTO uses USDT liquidity rather than a coin price or a shared fixed 50k amount', () => {
  const cases = [
    { name: 'high price / deep liquidity', price: 100_000, usual: 100_000 },
    { name: 'mid price / medium liquidity', price: 2500, usual: 10_000 },
    { name: 'low price / thin liquidity', price: .00001, usual: 100 },
  ];
  const cuts: number[] = [];
  for (const coin of cases) {
    const book = new HookChartDensityBook();
    book.apply(makeBook(coin.price, coin.usual, { 10: coin.usual * 10 }), now);
    const result = book.read(auto, 0, now);
    assert.equal(result.densities.length, 1, coin.name);
    assert.ok(Math.abs(result.densities[0].usd - coin.usual * 10) < .001);
    assert.ok(result.densityCut > coin.usual && result.densityCut < coin.usual * 10);
    cuts.push(result.densityCut);
  }
  assert.ok(cuts[0] > cuts[1] && cuts[1] > cuts[2]);
  assert.ok(cuts[2] < 1000, 'small markets have their own small threshold');
});

test('the same USDT-sized book yields the same AUTO threshold for high and low coin prices', () => {
  const cuts = [100_000, 100, .00001].map(price => {
    const book = new HookChartDensityBook();
    book.apply(makeBook(price, 1000, { 10: 10_000 }), now);
    return book.read(auto, 0, now).densityCut;
  });
  assert.ok(Math.max(...cuts) - Math.min(...cuts) <= 1);
});

test('a new market snapshot discards the previous coin’s AUTO amount immediately', () => {
  const book = new HookChartDensityBook();
  book.apply(makeBook(100_000, 100_000, { 10: 1_000_000 }), now);
  assert.ok(book.read(auto, 0, now).densityCut > 100_000);
  book.apply(makeBook(.00001, 100, { 10: 1000 }), now + 1);
  const small = book.read(auto, 0, now + 1);
  assert.ok(small.densityCut < 1000);
  assert.equal(small.densities.length, 1);
  assert.ok(small.densities[0].p < .001);
});

test('AUTO has no invented 50k fallback when the requested range contains no depth', () => {
  const book = new HookChartDensityBook();
  book.apply({ isSnapshot: true, sequence: 1, bids: [[90, 100]], asks: [[110, 100]] }, now);
  const result = book.read(auto, 0, now);
  assert.equal(result.depthReady, true);
  assert.equal(result.densityCut, 0);
  assert.deepEqual(result.densities, []);
});

test('manual USDT thresholds override AUTO for every price and liquidity scale', () => {
  for (const price of [100_000, 100, .00001]) {
    const book = new HookChartDensityBook();
    book.apply(makeBook(price, 1000, { 10: 10_000 }), now);
    assert.equal(book.read({ ...auto, densityMode: 'manual', densityThreshold: 20_000 }, 0, now).densities.length, 0);
    assert.equal(book.read({ ...auto, densityMode: 'manual', densityThreshold: 5000 }, 0, now).densities.length, 1);
  }
});
