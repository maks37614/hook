import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketTickerFeed } from '../server/marketTickerFeed';
import { fetchMarketCoins } from '../server/marketService';
import { loadMarketCoins } from '../src/utils/marketCoinLoader';
import { fetchDirectBinanceTickers, fetchDirectBybitTickers, type DirectTickerOptions, type DirectTickerSourceStatus } from '../src/utils/directExchangeClient';
import type { MarketCoin } from '../src/types';

const binanceTicker = { symbol: 'BTCUSDT', lastPrice: '100', priceChangePercent: '2', quoteVolume: '1000', highPrice: '102', lowPrice: '98' };
const bybitTicker = { symbol: 'BTCUSDT', lastPrice: '100', price24hPcnt: '0.02', turnover24h: '1000', highPrice24h: '102', lowPrice24h: '98' };
const json = (data: unknown, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', ...headers },
});

test('ticker requests coalesce; cache keeps actual quote time and stale data expires', async () => {
  let clock = 1000;
  let calls = 0;
  let fail = false;
  const feed = new MarketTickerFeed(async () => {
    calls++;
    return fail ? json({}, 503) : json([binanceTicker]);
  }, () => clock);
  const [first, concurrent] = await Promise.all([feed.get('binance', 'futures'), feed.get('binance', 'futures')]);
  assert.deepEqual(first, concurrent);
  assert.equal(first.length, 1);
  assert.equal(calls, 1);
  clock = 2000;
  await feed.get('binance', 'futures');
  assert.equal(calls, 1);
  assert.equal(feed.status('binance', 'futures').updatedAt, 1000);
  clock = 17_000;
  fail = true;
  assert.deepEqual(await feed.get('binance', 'futures'), first);
  assert.equal(feed.status('binance', 'futures').status, 'stale');
  assert.equal(feed.status('binance', 'futures').updatedAt, 1000);
  await feed.get('binance', 'futures');
  assert.equal(calls, 3, 'failure cooldown prevents requests after the bounded retry');
  clock = 122_000;
  assert.deepEqual(await feed.get('binance', 'futures'), []);
  assert.equal(feed.status('binance', 'futures').status, 'unavailable');
});

test('regional denial and rate limit stop mirror retries; retry-after is respected', async () => {
  for (const code of [403, 451, 418, 429]) {
    let clock = 1000;
    let calls = 0;
    const feed = new MarketTickerFeed(async () => {
      calls++;
      return json({}, code, { 'retry-after': '120' });
    }, () => clock);
    assert.deepEqual(await feed.get('bybit', 'spot'), []);
    assert.equal(calls, 1);
    assert.equal(feed.status('bybit', 'spot').httpStatus, code);
    clock += 60_000;
    await feed.get('bybit', 'spot');
    assert.equal(calls, 1);
  }
});

test('Bybit API error is unavailable, not an empty successful market', async () => {
  const feed = new MarketTickerFeed(async () => json({ retCode: 10006, result: { list: [] } }));
  assert.deepEqual(await feed.get('bybit', 'futures'), []);
  assert.equal(feed.status('bybit', 'futures').status, 'unavailable');
  assert.match(feed.status('bybit', 'futures').error!, /10006/);
});

test('valid empty markets are successful and malformed quotes never enter results', async () => {
  const feed = new MarketTickerFeed(async () => json([{ ...binanceTicker, lastPrice: 'Infinity' }]));
  assert.deepEqual(await feed.get('binance', 'spot'), []);
  assert.equal(feed.status('binance', 'spot').status, 'live');
  const empty = await loadMarketCoins({ exchange: 'binance', marketType: 'spot' }, new AbortController().signal, {
    request: async () => json({ success: true, data: [], timestamp: 10 }),
    binance: async () => { throw new Error('should not fall back for a valid empty response'); },
    bybit: async () => { throw new Error('wrong exchange'); },
  });
  assert.deepEqual(empty, { coins: [], timestamp: 10, warning: null });
});

test('partial backend snapshots expose failed sources and original quote time', async () => {
  const snapshot = await loadMarketCoins({ exchange: 'all', marketType: 'all' }, new AbortController().signal, {
    request: async () => json({ success: true, data: [], timestamp: 1234,
      sources: [{ exchange: 'bybit', marketType: 'futures', status: 'unavailable', error: 'HTTP 403' }] }),
    binance: async () => [], bybit: async () => [],
  });
  assert.equal(snapshot.timestamp, 1234);
  assert.match(snapshot.warning!, /Bybit Futures.*HTTP 403/);
});

test('direct fallback requests only the selected exchange and market with zero volume floor', async () => {
  let calls = 0;
  const coin = { symbol: 'BTCUSDT', exchange: 'binance', marketType: 'spot', volumeUsd: 1000 } as MarketCoin;
  const snapshot = await loadMarketCoins({ exchange: 'binance', marketType: 'spot' }, new AbortController().signal, {
    request: async () => { throw new Error('network'); },
    binance: async (options = {}) => {
      calls++;
      assert.equal(options.marketType, 'spot');
      assert.equal(options.minVolumeUsd, 0);
      assert.ok(options.signal);
      return [coin, { ...coin, marketType: 'futures' }];
    },
    bybit: async () => { throw new Error('wrong exchange'); },
  });
  assert.deepEqual(snapshot.coins, [coin]);
  assert.equal(calls, 1);
  assert.equal(snapshot.warning, null);
});

test('screener uses the public quote endpoint and successful sources do not show a warning', async () => {
  const coin = { symbol: 'BTCUSDT', exchange: 'bybit', marketType: 'futures' } as MarketCoin;
  const snapshot = await loadMarketCoins({ exchange: 'bybit', marketType: 'futures' }, new AbortController().signal, {
    request: async (input, options) => {
      const url = new URL(String(input), 'https://signalhook.example');
      assert.equal(url.pathname, '/api/market/quotes');
      assert.equal(url.searchParams.get('exchange'), 'bybit');
      assert.equal(url.searchParams.get('marketType'), 'futures');
      assert.equal(url.searchParams.get('minVolume'), '0');
      assert.equal(options?.cache, 'no-store');
      return json({ success: true, data: [coin], timestamp: 10,
        sources: [{ exchange: 'bybit', marketType: 'futures', status: 'live' }] });
    },
    binance: async () => { throw new Error('unexpected fallback'); },
    bybit: async () => { throw new Error('unexpected fallback'); },
  });
  assert.deepEqual(snapshot, { coins: [coin], timestamp: 10, warning: null });
});

test('browser fetch receives no dependency object as its receiver', async () => {
  const snapshot = await loadMarketCoins({ exchange: 'binance', marketType: 'spot' }, new AbortController().signal, {
    request: async function(this: unknown) {
      assert.equal(this, undefined, 'native browser fetch rejects a non-Window receiver');
      return json({ success: true, data: [], timestamp: 10 });
    },
    binance: async () => { throw new Error('unexpected fallback'); },
    bybit: async () => { throw new Error('unexpected fallback'); },
  });
  assert.deepEqual(snapshot, { coins: [], timestamp: 10, warning: null });
});

test('default market loading uses fetch installed after module initialization', async t => {
  const calls: string[] = [];
  const coin = { symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures' } as MarketCoin;
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0]) => {
    calls.push(String(input));
    return json({ success: true, data: [coin], timestamp: 100 });
  });
  const snapshot = await loadMarketCoins({ exchange: 'binance', marketType: 'futures' }, new AbortController().signal);
  assert.deepEqual(snapshot.coins, [coin]);
  assert.equal(calls.length, 1, 'the current authentication/market transport must handle the first request');
  assert.match(calls[0], /^\/api\/market\/quotes\?/);
});

test('account denials do not start a second market scan through the same protected relay', async () => {
  for (const status of [401, 403]) {
    let backendCalls = 0, fallbackCalls = 0;
    await assert.rejects(loadMarketCoins({ exchange: 'all', marketType: 'all' }, new AbortController().signal, {
      request: async () => { backendCalls++; return json({ success: false, error: 'Увійдіть у свій обліковий запис' }, status); },
      binance: async () => { fallbackCalls++; return []; },
      bybit: async () => { fallbackCalls++; return []; },
    }), /Увійдіть/);
    assert.equal(backendCalls, 1);
    assert.equal(fallbackCalls, 0, 'retrying public-data URLs cannot repair an expired account session');
  }
});

test('a transient backend failure recovers before attempting direct browser APIs', async () => {
  for (const failure of ['network', 'html', 'gateway']) {
    let calls = 0;
    let fallbackCalls = 0;
    const fallback = async () => { fallbackCalls++; return []; };
    const snapshot = await loadMarketCoins({ exchange: 'binance', marketType: 'spot' }, new AbortController().signal, {
      request: async () => {
        if (++calls === 1) {
          if (failure === 'network') throw new TypeError('Failed to fetch');
          return new Response('<html>Temporary proxy failure</html>', { status: failure === 'gateway' ? 502 : 200 });
        }
        return json({ success: true, data: [], timestamp: 1234 });
      },
      binance: fallback, bybit: fallback,
    });
    assert.deepEqual(snapshot, { coins: [], timestamp: 1234, warning: null });
    assert.equal(calls, 2);
    assert.equal(fallbackCalls, 0);
  }
});

test('structured provider failures go straight to fallback without repeating backend cooldown requests', async () => {
  let calls = 0;
  let fallbackCalls = 0;
  await assert.rejects(loadMarketCoins({ exchange: 'binance', marketType: 'futures' }, new AbortController().signal, {
    request: async () => {
      calls++;
      return json({ success: false, error: 'Binance: HTTP 429', sources: [
        { exchange: 'binance', marketType: 'futures', status: 'unavailable', error: 'HTTP 429' },
      ] }, 503);
    },
    binance: async () => { fallbackCalls++; return []; },
    bybit: async () => { throw new Error('wrong exchange'); },
  }), /Binance: HTTP 429/);
  assert.equal(calls, 1);
  assert.equal(fallbackCalls, 1);
});

test('all four successful direct sources load concurrently without a fallback warning', async () => {
  const calls: string[] = [];
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  const ticker = (exchange: 'binance' | 'bybit') => async (options: DirectTickerOptions = {}) => {
    assert.notEqual(options.marketType, 'all');
    const marketType = options.marketType as 'spot' | 'futures';
    calls.push(`${exchange}:${marketType}`);
    if (calls.length === 4) release();
    await ready;
    options.onSourceStatus?.({ exchange, marketType, status: 'live', updatedAt: marketType === 'spot' ? 200 : 100 });
    return [{ symbol: 'BTCUSDT', exchange, marketType } as MarketCoin];
  };
  const snapshot = await loadMarketCoins({ exchange: 'all', marketType: 'all' }, new AbortController().signal, {
    request: async () => { throw new Error('network'); }, binance: ticker('binance'), bybit: ticker('bybit'),
  });
  assert.equal(calls.length, 4);
  assert.equal(snapshot.coins.length, 4);
  assert.equal(snapshot.timestamp, 100);
  assert.equal(snapshot.warning, null);
});

test('partial direct snapshots identify only the unavailable exchange and market', async () => {
  const ticker = (exchange: 'binance' | 'bybit') => async (options: DirectTickerOptions = {}) => {
    const marketType = options.marketType as 'spot' | 'futures';
    const unavailable = exchange === 'binance' && marketType === 'futures';
    options.onSourceStatus?.({ exchange, marketType, status: unavailable ? 'unavailable' : 'live',
      updatedAt: unavailable ? null : 100, ...(unavailable ? { error: 'HTTP 451' } : {}) });
    return unavailable ? [] : [{ symbol: 'BTCUSDT', exchange, marketType } as MarketCoin];
  };
  const snapshot = await loadMarketCoins({ exchange: 'all', marketType: 'all' }, new AbortController().signal, {
    request: async () => { throw new Error('network'); }, binance: ticker('binance'), bybit: ticker('bybit'),
  });
  assert.equal(snapshot.coins.length, 3);
  assert.equal(snapshot.warning, 'Binance Futures: дані недоступні (HTTP 451)');
});

test('a valid empty direct market is a successful response, not a failed source', async () => {
  const snapshot = await loadMarketCoins({ exchange: 'bybit', marketType: 'spot' }, new AbortController().signal, {
    request: async () => { throw new Error('network'); },
    binance: async () => { throw new Error('wrong exchange'); },
    bybit: async (options: DirectTickerOptions = {}) => {
      options.onSourceStatus?.({ exchange: 'bybit', marketType: 'spot', status: 'live', updatedAt: 100 });
      return [];
    },
  });
  assert.deepEqual(snapshot, { coins: [], timestamp: 100, warning: null });
});

test('cancelled direct requests cannot publish a late quote snapshot', async () => {
  const controller = new AbortController();
  await assert.rejects(loadMarketCoins({ exchange: 'binance', marketType: 'spot' }, controller.signal, {
    request: async () => { throw new Error('network'); },
    binance: async () => {
      controller.abort();
      return [{ symbol: 'BTCUSDT', exchange: 'binance', marketType: 'spot' } as MarketCoin];
    },
    bybit: async () => { throw new Error('wrong exchange'); },
  }), { name: 'AbortError' });
});

test('direct clients report valid empty sources and regional/API failures accurately', async () => {
  const originalFetch = globalThis.fetch;
  const sources: DirectTickerSourceStatus[] = [];
  const urls: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input);
    urls.push(url);
    if (url.includes('fapi')) return json({}, 451);
    if (url.includes('bybit') || url.includes('bytick')) {
      return url.includes('linear') ? json({ retCode: 10006, result: { list: [] } })
        : json({ retCode: 0, result: { list: [] } });
    }
    return json([]);
  };
  try {
    assert.deepEqual(await fetchDirectBinanceTickers({ minVolumeUsd: 0, onSourceStatus: source => sources.push(source) }), []);
    assert.deepEqual(await fetchDirectBybitTickers({ minVolumeUsd: 0, onSourceStatus: source => sources.push(source) }), []);
    assert.deepEqual(sources.map(source => [source.exchange, source.marketType, source.status]), [
      ['binance', 'futures', 'unavailable'], ['binance', 'spot', 'live'],
      ['bybit', 'futures', 'unavailable'], ['bybit', 'spot', 'live'],
    ]);
    assert.equal(sources[0].error, 'HTTP 451');
    assert.equal(sources[2].error, 'Bybit retCode 10006');
    assert.equal(urls.filter(url => url.includes('fapi')).length, 1, 'regional denial does not retry mirrors');
    assert.equal(urls.filter(url => url.includes('binance.vision')).length, 1, 'valid empty data stops retries');
  } finally { globalThis.fetch = originalFetch; }
});

test('cancelled old selections never start fallback; complete failure preserves the provider reason', async () => {
  const controller = new AbortController();
  const pending = loadMarketCoins({ exchange: 'all', marketType: 'all' }, controller.signal, {
    request: async () => { controller.abort(); throw new Error('aborted'); },
    binance: async () => { throw new Error('fallback must not start'); },
    bybit: async () => { throw new Error('fallback must not start'); },
  });
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(loadMarketCoins({ exchange: 'all', marketType: 'all' }, new AbortController().signal, {
    request: async () => json({ success: false, error: 'Bybit: HTTP 403' }, 503),
    binance: async () => [], bybit: async () => [],
  }), /Bybit: HTTP 403/);
});

test('direct spot fallback skips futures and retains small-volume quotes', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async input => {
    urls.push(String(input));
    return String(input).includes('bybit') ? json({ retCode: 0, result: { list: [bybitTicker] } }) : json([binanceTicker]);
  };
  try {
    const binance = await fetchDirectBinanceTickers({ marketType: 'spot', minVolumeUsd: 0 });
    const bybit = await fetchDirectBybitTickers({ marketType: 'spot', minVolumeUsd: 0 });
    assert.equal(binance.length, 1);
    assert.equal(bybit.length, 1);
    assert.equal(urls.filter(url => !url.includes("kline")).length, 2);
    assert.ok(urls.every(url => !url.includes('fapi') && !url.includes('linear')));
  } finally { globalThis.fetch = originalFetch; }
});

test('quote loading returns while optional 5m enrichment is still pending', async () => {
  const originalFetch = globalThis.fetch;
  const pending: (() => void)[] = [];
  let enrichmentFinished = false;
  globalThis.fetch = async input => {
    const url = String(input);
    // Daily location history is a separate nonblocking enrichment.
    if (url.includes('interval=1d') || url.includes('interval=D')) {
      return url.includes('/v5/') ? json({ retCode: 0, result: { list: [] } }) : json([]);
    }
    if (url.includes('/klines') || url.includes('/kline') || url.includes('windowSize=')) {
      await new Promise<void>(resolve => pending.push(resolve));
      enrichmentFinished = true;
      if (url.includes('windowSize=')) return json([binanceTicker]);
      const candles = [[Date.now() - 300000, '100', '102', '98', '100', '10']];
      return url.includes('/v5/') ? json({ retCode: 0, result: { list: candles } }) : json(candles);
    }
    return url.includes('/v5/') ? json({ retCode: 0, result: { list: [bybitTicker] } }) : json([binanceTicker]);
  };
  try {
    const snapshot = await fetchMarketCoins({ exchange: 'all', marketType: 'all', minVolumeUsd: 0 });
    assert.equal(snapshot.length, 4);
    assert.equal(enrichmentFinished, false);
    // Allow the enrichment tasks to reach their deliberately suspended requests.
    for (let n = 0; pending.length < 4 && n < 200; n++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(pending.length, 4);
  } finally {
    pending.forEach(resolve => resolve());
    // Enrichment consumes the released mock responses before restoring real fetch.
    await new Promise(resolve => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
  }
});
