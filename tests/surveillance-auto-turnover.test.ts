import test from 'node:test';
import assert from 'node:assert/strict';
import { ExchangeStreamClient, type RawDepthDelta } from '../server/surveillance/exchangeStream';
import { acquireExchangeStream } from '../server/surveillance/sharedExchangeStream';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';

test('Bybit turnover-only ticker updates the coin AUTO threshold without falsifying price freshness', t => {
  t.mock.method(ExchangeStreamClient.prototype, 'connect', () => {});
  const handle = acquireExchangeStream('GOOGLUSDT', 'bybit', 'futures');
  const source = (handle as any).entry.source as ExchangeStreamClient;
  const book = new OrderBookEngine('GOOGLUSDT', 'bybit', 'futures');
  const now = Date.now();
  const priceEvents: number[] = [];
  source.on('price', (sample: { price: number }) => priceEvents.push(sample.price));
  handle.on('turnover24h', () => book.setVolume24hUsd(handle.marketTicker.volume24hUsd));
  handle.on('depth', (delta: RawDepthDelta) => {
    book.setVolume24hUsd(handle.marketTicker.volume24hUsd);
    book.applyDepth(delta, handle.validatedDepth(delta), handle.sharedBook(delta));
  });
  source.status = 'LIVE';
  try {
    (source as any).handleIncomingMessage({
      topic: 'tickers.GOOGLUSDT', type: 'snapshot', ts: now,
      data: { symbol: 'GOOGLUSDT', lastPrice: '100', turnover24h: '1000000' },
    });
    source.emit('depth', {
      isSnapshot: true, sequence: 1, eventTime: now,
      bids: [[100, 20], [99, 1]], asks: [[101, 10], [102, 1]],
    } satisfies RawDepthDelta);
    assert.deepEqual(priceEvents, [100]);
    assert.equal(handle.marketTicker.volume24hUsd, 1_000_000);
    assert.equal(book.calculateAdaptiveThreshold(), 25_000,
      'even small-volume markets must not count a $1k level as unusual');
    const quoteTime = handle.marketTicker.exchangeTime;

    (source as any).handleIncomingMessage({
      topic: 'tickers.GOOGLUSDT', type: 'delta', ts: now + 1,
      data: { symbol: 'GOOGLUSDT', turnover24h: '1000000000' },
    });
    assert.equal(handle.marketTicker.volume24hUsd, 1_000_000_000);
    assert.ok(Math.abs(book.calculateAdaptiveThreshold() - (30_000 * Math.pow(100,.55))) < .01,
      'a turnover-only delta must immediately change the personal AUTO floor');
    assert.deepEqual(priceEvents, [100], 'no synthetic price update');
    assert.equal(handle.marketTicker.exchangeTime, quoteTime,
      'turnover-only events must not refresh quote freshness');

    (source as any).handleIncomingMessage({
      topic: 'tickers.GOOGLUSDT', type: 'delta', ts: now + 2,
      data: { symbol: 'GOOGLUSDT', lastPrice: '101' },
    });
    assert.deepEqual(priceEvents, [100, 101]);
    assert.equal(handle.marketTicker.volume24hUsd, 1_000_000_000,
      'a price-only delta must not overwrite separately observed turnover');
    assert.ok(book.calculateAdaptiveThreshold() > 370_000);
    (source as any).handleIncomingMessage({
      topic: 'tickers.GOOGLUSDT', type: 'delta', ts: now + 3,
      data: { symbol: 'GOOGLUSDT', turnover24h: 'NaN' },
    });
    assert.equal(handle.marketTicker.volume24hUsd, 1_000_000_000,
      'non-finite turnover is ignored');
    for (const value of [null, '', ' ']) {
      (source as any).handleIncomingMessage({
        topic: 'tickers.GOOGLUSDT', type: 'delta', ts: now + 3,
        data: { symbol: 'GOOGLUSDT', turnover24h: value },
      });
      assert.equal(handle.marketTicker.volume24hUsd, 1_000_000_000,
        'empty or null turnover must not be mistaken for zero');
    }
    (source as any).handleIncomingMessage({
      topic: 'tickers.GOOGLUSDT', type: 'delta', ts: now + 1,
      data: { symbol: 'GOOGLUSDT', turnover24h: '1' },
    });
    assert.equal(handle.marketTicker.volume24hUsd, 1_000_000_000,
      'older ticker updates cannot rewind turnover');

    source.status = 'STALE';
    source.emit('status', 'STALE');
    assert.equal(handle.marketTicker.volume24hUsd, 0,
      'disconnect invalidates the old turnover instead of reusing it for AUTO');
    assert.equal(handle.hasFreshMarketQuote(), false);
  } finally { handle.destroy(); }
});

test('AUTO uses each market turnover and the observed single-level DOM median', () => {
  const now = Date.now();
  const light = new OrderBookEngine('LIGHTUSDT', 'bybit', 'spot');
  const liquid = new OrderBookEngine('LIQUIDUSDT', 'binance', 'futures');
  const delta: RawDepthDelta = {
    isSnapshot: true, sequence: 1, eventTime: now,
    bids: [[100, 20], [99, 1]], asks: [[101, 10], [102, 1]],
  };
  light.setVolume24hUsd(5_000_000);
  liquid.setVolume24hUsd(900_000_000);
  light.applyDepth(delta);
  liquid.applyDepth(delta);
  assert.equal(light.calculateAdaptiveThreshold(), 25_000);
  assert.ok(Math.abs(liquid.calculateAdaptiveThreshold() - (30_000 * Math.pow(90,.55))) < 0.01);
  assert.deepEqual(light.getDensities(), [], 'a typical $2K level is not an AUTO outlier');
  assert.deepEqual(liquid.getDensities(), [], 'same $2K order is not large for the deeper market');
  light.updateConfig({ mode: 'MANUAL', manualThresholdUsd: 1_500 });
  assert.equal(light.calculateAdaptiveThreshold(), 1_500);
  light.updateConfig({ mode: 'HYBRID', manualThresholdUsd: 7_500 });
  assert.equal(light.calculateAdaptiveThreshold(), 25_000, 'HYBRID respects the larger AUTO baseline');
});

