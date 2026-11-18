import test from 'node:test';
import assert from 'node:assert/strict';
import type { Kline } from '../src/types';
import {
  getVerifiedClosedBtcCandles,
  describeVerifiedBtcStructure,
  buildVerifiedBtcContext,
} from '../server/verifiedBtcContext';

const NOW = Date.UTC(2026, 10, 14, 12, 30, 30);
const bars = (timeframeSeconds: number, count = 25, descending = false): Kline[] => {
  const nowSecs = Math.floor(NOW / 1000);
  const lastOpen = Math.floor((nowSecs - timeframeSeconds) / timeframeSeconds) * timeframeSeconds;
  return Array.from({ length: count }, (_, i) => {
    const close = 67_000 + (descending ? -i : i) * 11;
    return {
      time: lastOpen - (count - 1 - i) * timeframeSeconds,
      open: close - 2,
      high: close + 8,
      low: close - 10,
      close,
      volume: 100 + i,
    };
  });
};
const feed = () => ({
  '15m': bars(900),
  '5m': bars(300),
  '1m': bars(60),
});

test('live Binance closed candlesticks use SECONDS, not raw milliseconds', () => {
  const result = getVerifiedClosedBtcCandles(bars(900), '15m', NOW);
  assert.equal(result.length, 25);
  assert.equal(result[0].time, bars(900)[0].time);
  assert.equal(describeVerifiedBtcStructure(result).structure, 'HH_HL');
  assert.equal(describeVerifiedBtcStructure(bars(900, 25, true)).structure, 'LH_LL');
});

test('no fake trends or quotes on stale, missing or gapped BTC candles', () => {
  const old = bars(900).map(x => ({ ...x, time: x.time - 86_400 }));
  assert.equal(getVerifiedClosedBtcCandles(old, '15m', NOW).length, 0);
  const gapped = bars(900).filter((_, i) => i !== 22);
  assert.ok(getVerifiedClosedBtcCandles(gapped, '15m', NOW).length < 6);
  const missing = buildVerifiedBtcContext({ ...feed(), '15m': [] }, null, NOW);
  assert.equal(missing.timeframes['15m'].structure, 'unknown');
  assert.equal(missing.overallStructure, 'unknown');
  assert.equal(missing.change24h, null);
  assert.deepEqual(missing.upcomingNews, []);
});

test('without a Binance ticker BTC price is labeled last CLOSED one-minute candle', () => {
  const data = buildVerifiedBtcContext(feed(), null, NOW);
  assert.equal(data.priceSource, 'closed_1m_candle');
  assert.equal(data.btcPrice, feed()['1m'].at(-1)?.close);
  assert.equal(data.change24h, null);
  assert.equal(data.timeframes['15m'].structure, 'HH_HL');
  assert.equal(data.timeframes['5m'].structure, 'HH_HL');
  assert.equal(data.overallStructure, 'HH_HL');
});

test('verified ticker with closeTime yields 24h change, stale ticker is not used', () => {
  const ticker = {
    symbol: 'BTCUSDT', lastPrice: '67543.2',
    priceChangePercent: '-2.35', closeTime: NOW - 500,
  };
  const current = buildVerifiedBtcContext(feed(), ticker, NOW);
  assert.equal(current.priceSource, 'binance_ticker');
  assert.equal(current.btcPrice, 67543.2);
  assert.equal(current.change24h, -2.35);
  const stale = buildVerifiedBtcContext(feed(), { ...ticker, closeTime: NOW - 3_000_000 }, NOW);
  assert.equal(stale.priceSource, 'closed_1m_candle');
  assert.equal(stale.change24h, null);
});
