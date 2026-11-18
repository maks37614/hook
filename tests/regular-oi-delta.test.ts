import test from 'node:test';
import assert from 'node:assert/strict';
import type { Kline, ScannedCoin, DetectedFormation } from '../src/types';
import {
  calculateBinanceQuoteTradeDelta, calculateRegularIndicatorValues,
  matchesRegularIndicatorFilters, DEFAULT_REGULAR_INDICATOR_FILTERS,
  countActiveRegularIndicatorFilters, readRegularFormationEvidence,
} from '../src/utils/regularFormationIndicators';
import {
  verifyOIHistory, parseBinanceOIHistory, parseBybitOIHistory,
  fetchRegularOISnapshot,
} from '../server/regularOI';
import { summarizeVerifiedUsdOI } from '../server/oiIntegrity';
import { bybitOIToUsd } from '../server/hookchartOI';

const now = 1_800_000_000_000;
const period = 900_000;
const amount = [
  { t: now - 3*period, amount: 100, usd: 123_000 },
  { t: now - 2*period, amount: 101, usd: 124_000 },
  { t: now - period, amount: 102, usd: 125_000 },
];

test('historical OI change uses native contract/coin amounts rather than price-driven USD value', () => {
  const result = verifyOIHistory(amount, period, now);
  assert.ok(result);
  assert.equal(result.changePct, 0.99);
  assert.equal(result.usd, 125_000);
  assert.equal(result.timestamp, now - period);
  const withPriceSurge = amount.map((row, i) => ({ ...row, usd: row.usd! * (i + 1) }));
  assert.equal(verifyOIHistory(withPriceSurge, period, now)?.changePct, 0.99);
});

test('OI never invents a change from missing, stale, duplicated, nonadjacent or future snapshots', () => {
  assert.equal(verifyOIHistory(amount.slice(-1), period, now), null);
  assert.equal(verifyOIHistory([{ ...amount[0], t: amount[1].t }, amount[1], amount[2]], period, now), null);
  assert.equal(verifyOIHistory([{ ...amount[0], t: amount[0].t - period }, amount[1], amount[2]], period, now), null);
  assert.equal(verifyOIHistory(amount, period, now + 4*period), null);
  assert.equal(verifyOIHistory(amount, period, now - 4*period), null);
  assert.equal(verifyOIHistory([{ ...amount[0], amount: 0 }, ...amount.slice(1)], period, now), null);
});

test('OI exchange payloads enforce Bybit status and Binance native amount', () => {
  const b = parseBinanceOIHistory(amount.map(row => ({
    timestamp: row.t, sumOpenInterest: String(row.amount),
    sumOpenInterestValue: String(row.usd),
  })));
  assert.deepEqual(b, amount);
  const y = parseBybitOIHistory({ retCode: 0, result: { list: amount.map(row => ({
    timestamp: String(row.t), openInterest: String(row.amount),
  })) } });
  assert.equal(verifyOIHistory(y, period, now)?.changePct, 0.99);
  assert.deepEqual(parseBybitOIHistory({ retCode: 10001, result: { list: [] } }), []);
  assert.deepEqual(parseBinanceOIHistory({ code: -1121, msg: 'Invalid symbol' }), []);
});

test('spot and unsupported one-minute OI always return unavailable without network', async () => {
  assert.equal(await fetchRegularOISnapshot('binance', 'spot', 'BTCUSDT', '15m'), null);
  assert.equal(await fetchRegularOISnapshot('bybit', 'futures', 'BTCUSDT', '1m'), null);
  assert.equal(await fetchRegularOISnapshot('binance', 'futures', 'BAD/USDT', '15m'), null);
});

test('real one-hour OI chart never fills or simulates missing historical candles', () => {
  const hour = 3_600_000;
  const rows = Array.from({ length: 8 }, (_, i) => ({
    t: now - (8-i) * hour, v: 100_000 + i*1_000,
  }));
  const valid = summarizeVerifiedUsdOI(rows, now, hour);
  assert.equal(valid.currentUsd, 107_000);
  assert.equal(valid.change1hPct, 0.94);
  assert.equal(valid.history.length, 8);
  const broken = rows.filter((_, i) => i !== 4);
  const partial = summarizeVerifiedUsdOI(broken, now, hour);
  assert.equal(partial.currentUsd, 107_000);
  assert.equal(partial.change1hPct, 0.94);
  assert.equal(partial.history.length, 3, 'do not bridge the gap with synthetic points');
  const noRecent = summarizeVerifiedUsdOI(rows, now + 5*hour, hour);
  assert.deepEqual(noRecent, { currentUsd: null, change1hPct: null, history: [] });
  const solo = summarizeVerifiedUsdOI(rows.slice(-1), now, hour);
  assert.equal(solo.change1hPct, null);
  assert.deepEqual(solo.history, []);
});

test('Bybit OI-to-USD rejects an OI point whose price data is stale', () => {
  const klines = [
    [String(now - 5*period), '100', '101', '99', '100'],
    [String(now - 4*period), '100', '101', '99', '101'],
  ];
  const recent = [{ timestamp: String(now - 4*period + period/2), openInterest: '10' }];
  const stale = [{ timestamp: String(now - period), openInterest: '10' }];
  assert.equal(bybitOIToUsd(recent, klines).length, 1);
  assert.deepEqual(bybitOIToUsd(stale, klines), []);
});

const candles = (data: { total: number; buy: number }[]): Kline[] => data.map((x, i) => ({
  time: 1_700_000_000 + i*900, open: 100, high: 101, low: 99, close: 100,
  volume: x.total/100,
  quoteVolume: x.total,
  buyQuoteVolume: x.buy,
}));

test('real Binance taker delta is buy-minus-sell and CVD20 accumulates complete 20-bar window', () => {
  const rows = candles(Array.from({ length: 25 }, () => ({ total: 1000, buy: 700 })));
  const result = calculateRegularIndicatorValues(rows);
  assert.equal(result.deltaUsd, 400);
  assert.equal(result.deltaPct, 40);
  assert.equal(result.cvd20Usd, 8000);
  assert.equal(result.cvd20Pct, 40);
  assert.ok(result.atrPct !== null);
  const reversed = candles(Array.from({ length: 25 }, () => ({ total: 1000, buy: 300 })));
  assert.equal(calculateBinanceQuoteTradeDelta(reversed).deltaPct, -40);
  assert.equal(calculateBinanceQuoteTradeDelta(reversed).cvd20Usd, -8000);
});

test('CVD fails closed independently of the last candle delta', () => {
  const rows = candles(Array.from({ length: 25 }, () => ({ total: 1000, buy: 650 })));
  const lastOnly = { deltaPct: 30, deltaUsd: 300 };
  assert.deepEqual(calculateBinanceQuoteTradeDelta(rows.slice(-19)), lastOnly);
  assert.deepEqual(calculateBinanceQuoteTradeDelta(rows.map(r => ({...r, buyQuoteVolume: undefined}))), {});
  const broken = rows.map((r, i) => i === 10 ? { ...r, time: r.time - 200 } : r);
  assert.deepEqual(calculateBinanceQuoteTradeDelta(broken), lastOnly);
  const invalid = rows.map((r, i) => i === 15 ? { ...r, buyQuoteVolume: 1100 } : r);
  assert.deepEqual(calculateBinanceQuoteTradeDelta(invalid), lastOnly);
  const withMissingBuy = rows.map((r, i) => i === 16 ? { ...r, buyQuoteVolume: NaN } : r);
  assert.deepEqual(calculateBinanceQuoteTradeDelta(withMissingBuy), lastOnly);
  assert.deepEqual(calculateBinanceQuoteTradeDelta(rows.map((r, i) => i === 24 ? { ...r, buyQuoteVolume: undefined } : r)), {});
});

const formation = { id: 'f', category: 'continuation', bias: 'bearish', status: 'forming' } as DetectedFormation;
const coin = (marketType: 'spot' | 'futures' = 'futures', exchange: 'binance' | 'bybit' = 'binance') => ({
  marketType, exchange, regularIndicators: {
    atrPct: 1, rsi14: 50, oiChangePct: 2, deltaPct: 25, cvd20Pct: -5,
    tradeFlowSource: exchange === 'binance' ? 'binance-klines' : 'bybit-trades',
    oiAvailability: 'available', oiUpdatedAt: now, candleContext: { closedAt: now, close: 100, previousClose: 99 },
  },
}) as ScannedCoin;

test('regular OI/delta/CVD threshold filters enforce actual market support and null handling', () => {
  const f = DEFAULT_REGULAR_INDICATOR_FILTERS;
  assert.equal(countActiveRegularIndicatorFilters(f), 0);
  assert.equal(matchesRegularIndicatorFilters(coin(), formation, { ...f, oiChange: 'rising' }), true);
  assert.equal(matchesRegularIndicatorFilters(coin(), formation, { ...f, oiChange: 'falling' }), false);
  assert.equal(matchesRegularIndicatorFilters(coin('spot'), formation, { ...f, oiChange: 'rising' }), false);
  assert.equal(matchesRegularIndicatorFilters(coin(), formation, { ...f, delta: 'strongPositive' }), true);
  assert.equal(matchesRegularIndicatorFilters(coin(), formation, { ...f, delta: 'negative' }), false);
  assert.equal(matchesRegularIndicatorFilters(coin(), formation, { ...f, cvd20: 'negative' }), true);
  assert.equal(matchesRegularIndicatorFilters(coin(), formation, { ...f, cvd20: 'positive' }), false);
  assert.equal(countActiveRegularIndicatorFilters({
    ...f, oiChange: 'rising', delta: 'strongPositive', cvd20: 'negative',
  }), 3);
  const missing = { ...coin(), regularIndicators: { atrPct: 1, rsi14: 50 } } as ScannedCoin;
  assert.equal(matchesRegularIndicatorFilters(missing, formation, { ...f, oiChange: 'rising' }), false);
  assert.equal(matchesRegularIndicatorFilters(missing, formation, { ...f, delta: 'positive' }), false);
  assert.equal(matchesRegularIndicatorFilters(missing, formation, { ...f, cvd20: 'negative' }), false);
});


test('evidence rejects a different candle or exchange feed and out-of-range values', () => {
  const c = coin();
  const aligned = c.regularIndicators!;
  const read = (inputs = aligned, closedAt = now) => readRegularFormationEvidence(inputs, 'binance', 'futures', closedAt);
  assert.deepEqual(read(), { atrPct: 1, rsi14: 50, oiChangePct: 2, deltaPct: 25, cvd20Pct: -5 });
  assert.ok(Object.values(read(aligned, now - period)).every(value => value === undefined));
  for (const tradeFlowSource of [undefined, 'bybit-trades'] as const) {
    c.regularIndicators = { ...aligned, tradeFlowSource };
    assert.equal(matchesRegularIndicatorFilters(c, formation, { ...DEFAULT_REGULAR_INDICATOR_FILTERS, delta: 'positive' }), false);
    assert.equal(matchesRegularIndicatorFilters(c, formation, { ...DEFAULT_REGULAR_INDICATOR_FILTERS, cvd20: 'negative' }), false);
  }
  assert.ok(Object.values(read({ ...aligned, atrPct: -1, rsi14: 101, oiUpdatedAt: now - period,
    deltaPct: 101, cvd20Pct: -101 })).every(value => value === undefined));
});
