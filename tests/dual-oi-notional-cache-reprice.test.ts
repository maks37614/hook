import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withRepricedBinanceInPair, oiRequestPriceForResolvedSymbol } from '../server/oiPairNotional';

const cached = {
  binance: { exchange: 'binance', symbol: 'SOLUSDT', amountCoins: 1_000, valueUsd: 70_000 },
  bybit: { exchange: 'bybit', symbol: 'SOLUSDT', amountCoins: 300, valueUsd: 21_900 },
  totalOIUsd: 91_900,
};

test('dual OI preserves exchange coin quantities but recomputes Binance USD for each viewer quote', () => {
  const viewer = withRepricedBinanceInPair(cached, { ...cached.binance, valueUsd: 71_500 });
  assert.equal(viewer.binance?.amountCoins, 1_000);
  assert.equal(viewer.binance?.valueUsd, 71_500);
  assert.equal(viewer.bybit, cached.bybit, 'never reprice exchange-provided Bybit openInterestValue');
  assert.equal(viewer.totalOIUsd, 93_400);
  assert.equal(cached.binance.valueUsd, 70_000, 'cached data must not be mutated for other users');
  assert.equal(cached.totalOIUsd, 91_900);
});

test('a missing Binance market quote removes unverified Binance USD but keeps valid Bybit OI', () => {
  const viewer = withRepricedBinanceInPair(cached, null);
  assert.equal(viewer.binance, null);
  assert.equal(viewer.bybit, cached.bybit);
  assert.equal(viewer.totalOIUsd, 21_900);
});

test('invalid totals cannot contaminate combined OI', () => {
  const viewer = withRepricedBinanceInPair(cached, { ...cached.binance, valueUsd: NaN });
  assert.equal(viewer.binance, null, 'invalid Binance USD must not be displayed');
  assert.equal(viewer.totalOIUsd, 21_900);
  assert.equal(withRepricedBinanceInPair({ binance: null, bybit: null, totalOIUsd: Infinity }, null).totalOIUsd, 0);
});

test('all three server dual OI paths reprice cached, shared and initial results without extra exchange calls', () => {
  const source = readFileSync(new URL('../server/marketService.ts', import.meta.url), 'utf8');
  assert.match(source, /function withCurrentOiPairPrice\(pair: OiPair, currentPrice\?: number, requestedSymbol\?: string\): OiPair/);
  assert.match(source, /withRepricedBinanceInPair\(pair, withCurrentOiPrice\(pair.binance, currentPrice, requestedSymbol\)\)/);
  assert.match(source, /return withCurrentOiPairPrice\(cached.data, curPrice, rawSymbol\)/);
  assert.match(source, /return withCurrentOiPairPrice\(await existing, curPrice, rawSymbol\)/);
  assert.match(source, /return withCurrentOiPairPrice\(await pending, curPrice, rawSymbol\)/);
});

test('a quote from PEPE does not price Binance 1000PEPE futures open interest', () => {
  assert.equal(oiRequestPriceForResolvedSymbol('PEPEUSDT', '1000PEPEUSDT', 0.00001), undefined);
  assert.equal(oiRequestPriceForResolvedSymbol('BTC/USDT', 'BTCUSDT', 71_000), 71_000);
  assert.equal(oiRequestPriceForResolvedSymbol('1000PEPEUSDT', '1000PEPEUSDT', 0.01), 0.01);
  assert.equal(oiRequestPriceForResolvedSymbol('BTCUSDT', 'BTCUSDT', -1), undefined);
  assert.equal(oiRequestPriceForResolvedSymbol('BTCUSDT', 'BTCUSDT', NaN), undefined);
  const service = readFileSync(new URL('../server/marketService.ts', import.meta.url), 'utf8');
  assert.match(service,/oiRequestPriceForResolvedSymbol\(requestedSymbol, data.symbol, currentPrice\)/);
  assert.match(service,/Number.isFinite\(valueUsd\) && valueUsd > 0/);
  assert.match(service,/withCurrentOiPrice\(cached.data, curPrice, rawSymbol\)/);
  assert.match(service,/withCurrentOiPrice\(await existing, curPrice, rawSymbol\)/);
  assert.match(service,/withCurrentOiPrice\(await pending, curPrice, rawSymbol\)/);
});
