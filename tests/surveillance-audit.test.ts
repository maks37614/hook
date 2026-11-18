import test from 'node:test';
import assert from 'node:assert/strict';
import { ExchangeStreamClient } from '../server/surveillance/exchangeStream';
import { auditSurveillanceSources } from '../server/auditSurveillance';

const options = { symbol: 'TESTUSDT', exchange: 'binance' as const, market: 'futures' as const, threshold: 1000, timeoutMs: 50 };

test('live diagnostic cannot report success with neither live depth nor historical data', async t => {
  t.mock.method(ExchangeStreamClient.prototype, 'connect', function () {});
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 503 }));
  const report = await auditSurveillanceSources(options);
  assert.equal(report.success, false);
  assert.equal(report.orderBook, null);
  assert.equal(report.backtest, null);
  assert.equal(report.errors.length, 2);
});

test('diagnostic requires both a snapshot and a delta and can honestly report zero matching levels', async t => {
  t.mock.method(ExchangeStreamClient.prototype, 'connect', function (this: ExchangeStreamClient) {
    queueMicrotask(() => {
      this.emit('status', 'LIVE');
      this.emit('depth', { isSnapshot: true, sequence: 1, eventTime: Date.now(), bids: [[100, 1]], asks: [[101, 1]] });
      this.emit('depth', { sequence: 2, eventTime: Date.now(), bids: [[100, 2]], asks: [] });
    });
  });
  const step = 900000;
  const start = Math.floor(Date.now() / step) * step - 200 * step;
  t.mock.method(globalThis, 'fetch', async () => Response.json(Array.from({ length: 200 }, (_, i) => [start + i * step, '100', '101', '99', '100', '1'])));
  const report = await auditSurveillanceSources(options);
  assert.equal(report.success, true);
  assert.equal(report.orderBook?.snapshots, 1);
  assert.equal(report.orderBook?.deltas, 1);
  assert.equal(report.orderBook?.matchingLevels, 0);
  assert.equal(report.orderBook?.amountsMatch, true);
  assert.equal(report.backtest?.closedCandles, 200);
  assert.equal(report.backtest?.usesHistoricalOrderBook, false);
});
