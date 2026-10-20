import test from 'node:test';
import assert from 'node:assert/strict';
import './fixtures/mock-exchange';
import { fetchDualExchangeOI } from '../server/marketService';

test('OI notionals use the venue price and cannot be poisoned by a browser-supplied conversion price', async () => {
  const native = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/openInterestHist')) return Promise.resolve(Response.json([{ timestamp: Date.now(), sumOpenInterest: '1000', sumOpenInterestValue: '0' }]));
    if (url.hostname.includes('bybit') && url.pathname.endsWith('/tickers')) return Promise.resolve(Response.json({ retCode: 0, result: { list: [{ symbol: 'BTCUSDT', lastPrice: '100', openInterest: '1000', openInterestValue: '0' }] } }));
    return native(input, init);
  };
  try {
    const result = await fetchDualExchangeOI('BTCUSDT', 'BTC', 1_000_000_000);
    assert.equal(result.binance?.valueUsd, 100_000); assert.equal(result.bybit?.valueUsd, 100_000);
    assert.equal(result.totalOIUsd, 200_000);
  } finally { globalThis.fetch = native; }
});
