import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchMarketCoins } from '../server/marketService';
import { fetchDirectBinanceTickers, fetchDirectBybitTickers } from '../src/utils/directExchangeClient';

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

test('server and browser fallback load daily history and publish identical badges on refreshed quotes', async () => {
  const original = globalThis.fetch;
  const day = 86400;
  const today = Math.floor(Date.now() / 1000 / day) * day;
  const history = Array.from({ length: 731 }, (_, i) => [(today - (730 - i) * day) * 1000, '60', '110', '10', '60', '100']);
  let price = '105';
  const dailySources = new Set<string>();
  globalThis.fetch = async input => {
    const url = String(input);
    const bybit = url.includes('/v5/');
    if (url.includes('interval=1d') || url.includes('interval=D')) {
      assert.ok(url.includes('limit=731'));
      dailySources.add(`${bybit ? 'bybit' : 'binance'}:${url.includes('linear') || url.includes('fapi') ? 'futures' : 'spot'}`);
      return json(bybit ? { retCode: 0, result: { list: history.slice().reverse() } } : history);
    }
    if (url.includes('kline')) return json(bybit ? { retCode: 0, result: { list: [] } } : []);
    return json(bybit ? { retCode: 0, result: { list: [{ symbol: 'TESTUSDT', lastPrice: price,
      price24hPcnt: '0.01', turnover24h: '1000000', highPrice24h: '106', lowPrice24h: '104' }] } }
      : [{ symbol: 'TESTUSDT', lastPrice: price, priceChangePercent: '1', quoteVolume: '1000000', highPrice: '106', lowPrice: '104' }]);
  };
  try {
    const initial = await fetchMarketCoins({ exchange: 'all', marketType: 'all', minVolumeUsd: 0 });
    assert.equal(initial.length, 4);
    assert.ok(initial.every(c => !c.isNearHigh && !c.isNearLow));
    await fetchDirectBinanceTickers({ minVolumeUsd: 0 });
    await fetchDirectBybitTickers({ minVolumeUsd: 0 });
    // Let the bounded three-slot queues start their fourth source.
    await new Promise(resolve => setTimeout(resolve, 1700));
    const server = await fetchMarketCoins({ exchange: 'all', marketType: 'all', minVolumeUsd: 0 });
    const browser = [...await fetchDirectBinanceTickers({ minVolumeUsd: 0 }), ...await fetchDirectBybitTickers({ minVolumeUsd: 0 })];
    assert.equal(dailySources.size, 4);
    for (const c of server) {
      const direct = browser.find(d => d.exchange === c.exchange && d.marketType === c.marketType)!;
      assert.deepEqual(direct.location, c.location);
      assert.equal(c.isNearHigh, true);
      assert.equal(c.isNearLow, false);
      assert.equal(c.high24h, 106, '24h fields retain their original meaning');
    }
    price = '15';
    const changed = await fetchDirectBybitTickers({ marketType: 'spot', minVolumeUsd: 0 });
    assert.equal(changed[0].isNearLow, true, 'the current quote reprices cached historical ranges');
    assert.equal(changed[0].isNearHigh, false);
  } finally { globalThis.fetch = original; }
});
