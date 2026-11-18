import test from 'node:test';
import assert from 'node:assert/strict';
import { lowerMedian } from '../server/surveillance/lowerMedian';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';

function sortedLowerMedian(values: number[]): number {
  return values.length
    ? [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)]
    : 0;
}

test('fast density median exactly matches the original numeric sort', () => {
  let seed = 0x12345678;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  assert.equal(lowerMedian([]), 0);
  for (const length of [1, 2, 3, 4, 5, 16, 17, 64, 100, 101, 500, 501, 5000, 5001]) {
    const patterns = [
      Array.from({ length }, (_, i) => i),
      Array.from({ length }, (_, i) => length - i),
      Array.from({ length }, () => 77),
      Array.from({ length }, (_, i) => i % 2 ? 1 : 1000000),
      Array.from({ length }, () => (random() % 41) * 0.25),
    ];
    for (const values of patterns) {
      const original = values.slice();
      assert.equal(lowerMedian(values.slice()), sortedLowerMedian(values));
      assert.deepEqual(values, original, 'selection must not mutate its caller array');
    }
  }
});

test('live surveillance retains real book levels and uses conservative market-relative thresholds', () => {
  const bids: [number, number][] = Array.from({ length: 160 }, (_, i) => [100 - i / 100, 2 + ((i * 7) % 21)]);
  const asks: [number, number][] = Array.from({ length: 159 }, (_, i) => [101 + i / 100, 3 + ((i * 11) % 19)]);
  const book = new OrderBookEngine('BTCUSDT', 'binance', 'futures');
  book.applyDepth({ isSnapshot: true, sequence: 1, eventTime: Date.now(), bids, asks });
  assert.equal(book.status, 'LIVE');
  assert.equal(book.bestBid, 100);
  assert.equal(book.bestAsk, 101);
  assert.ok(book.calculateAdaptiveThreshold() >= 1_000_000,
    'unknown 24h turnover must not reduce the AUTO floor to ordinary $1k levels');
  assert.deepEqual(book.getDensities(), []);

  book.applyDepth({ sequence: 2, eventTime: Date.now(), bids: [[100, 0], [98.405, 40]], asks: [[101, 0]] });
  assert.equal(book.status, 'LIVE');
  assert.equal(book.bestBid, 99.99);
  assert.equal(book.bestAsk, 101.01);
  assert.ok(book.calculateAdaptiveThreshold() >= 1_000_000);
  book.setVolume24hUsd(900_000_000);
  const marketFloor = 30_000 * Math.pow(900_000_000 / 10_000_000, .55);
  assert.ok(Math.abs(book.calculateAdaptiveThreshold() - marketFloor) < 1e-6);
  assert.equal(book.calculateDensityThresholds().bid, book.calculateDensityThresholds().ask);
  assert.deepEqual(book.getDensities(), []);
});
