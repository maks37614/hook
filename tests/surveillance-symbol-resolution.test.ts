import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveSurveillanceSymbol, searchSurveillanceSymbols } from '../src/utils/marketSymbols';

const binanceFutures = [
  { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
  { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
  { symbol: '1000PEPEUSDT', baseAsset: '1000PEPE', quoteAsset: 'USDT' },
  { symbol: '龙虾USDT', baseAsset: '龙虾', quoteAsset: 'USDT' },
  { symbol: 'XUSDT', baseAsset: 'X', quoteAsset: 'USDT' },
  { symbol: 'USDCUSDT', baseAsset: 'USDC', quoteAsset: 'USDT' },
];

test('short ticker resolves only if an actual USDT pair is listed in the selected market', () => {
  for (const raw of ['BTC', 'btc', 'BTCUSDT', 'BTC/USDT', 'BTC-USDT', 'BTC_USDT']) {
    assert.deepEqual(resolveSurveillanceSymbol(raw, binanceFutures), {
      ok: true, symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', verified: true,
    });
  }
  assert.deepEqual(resolveSurveillanceSymbol('1000PEPE', binanceFutures), {
    ok: true, symbol: '1000PEPEUSDT', baseAsset: '1000PEPE', quoteAsset: 'USDT', verified: true,
  });
  assert.deepEqual(resolveSurveillanceSymbol('X', binanceFutures), {
    ok: true, symbol: 'XUSDT', baseAsset: 'X', quoteAsset: 'USDT', verified: true,
  });
  assert.deepEqual(resolveSurveillanceSymbol('USDC', binanceFutures), {
    ok: true, symbol: 'USDCUSDT', baseAsset: 'USDC', quoteAsset: 'USDT', verified: true,
  });
  assert.deepEqual(resolveSurveillanceSymbol('龙虾', binanceFutures), {
    ok: true, symbol: '龙虾USDT', baseAsset: '龙虾', quoteAsset: 'USDT', verified: true,
  });
});

test('unknown pair, unsupported quote and garbage never become a new subscription', () => {
  assert.deepEqual(resolveSurveillanceSymbol('NOTREAL', binanceFutures), {
    ok: false, code: 'UNKNOWN_PAIR',
  });
  assert.deepEqual(resolveSurveillanceSymbol('NOTREALUSDT', binanceFutures), {
    ok: false, code: 'UNKNOWN_PAIR',
  });
  assert.deepEqual(resolveSurveillanceSymbol('BTCUSDT!', binanceFutures), {
    ok: false, code: 'INVALID_SYMBOL',
  });
  assert.deepEqual(resolveSurveillanceSymbol('BTCUSDC', binanceFutures), {
    ok: false, code: 'UNSUPPORTED_QUOTE',
  });
  assert.deepEqual(resolveSurveillanceSymbol('USDT', binanceFutures), {
    ok: false, code: 'INVALID_SYMBOL',
  });
  assert.deepEqual(resolveSurveillanceSymbol('BTC', [binanceFutures[1]]), {
    ok: false, code: 'UNKNOWN_PAIR',
  }, 'pair exists elsewhere but not in the selected exchange/market');
});

test('during exchange outage, short ticker is blocked; complete USDT pair retains pending-analysis support', () => {
  assert.deepEqual(resolveSurveillanceSymbol('BTC', []), {
    ok: false, code: 'MARKET_UNAVAILABLE',
  });
  assert.deepEqual(resolveSurveillanceSymbol('BTCUSDT', []), {
    ok: true, symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', verified: false,
  });
});

test('surveillance API validates the selected exchange catalog and repairs legacy base-only records', () => {
  const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  assert.match(server, /await marketTickerFeed\.get\(selectedExchange, selectedMarket\)/);
  assert.match(server, /resolveSurveillanceSymbol\(symbol, tickerCatalog\)/);
  assert.match(server, /'code' in preliminary && preliminary\.code !== 'MARKET_UNAVAILABLE'/);
  assert.match(server, /if \('code' in resolved\)/);
  assert.match(server, /messages\[resolved\.code\]/);
  assert.match(server, /legacyBaseSymbol = cleanSymbol\.slice\(0, -4\)/);
  assert.match(server, /instrumentChanged \? \{ state: undefined, lastCheckedAt: undefined, lastNotifiedAt: undefined \}/);
  assert.match(server, /saveSurveillanceList\(uid, list\.map\(c => c\.id === existing\.id \? activeCoin : c\)\)/);
});

test('monitoring UI never presents a missing price or range as real zero market data', () => {
  const page = readFileSync(new URL('../src/components/SurveillancePage.tsx', import.meta.url), 'utf8');
  assert.match(page, /state\?\.currentPrice && state\.currentPrice > 0 \? '\$' \+ formatPrice\(state\.currentPrice\) : '—'/);
  assert.match(page, /const hasRealRange =/);
  assert.match(page, /hasRealRange \? '\$' \+ formatPrice\(state!\.support4h\) : '—'/);
  assert.match(page, /surveillance\.ui\.symbolHint/);
  assert.match(page, /surveillance\.ui\.repairSymbol/);
  assert.match(page, /res\.coin\?\.symbol \|\| selectedSymbolInput/);
});

test('typing BTC without USDT suggests the actual pair and ranks exact base first', () => {
  const list = [
    { symbol: '1000BTCUSDT', baseAsset: '1000BTC', quoteAsset: 'USDT' },
    { symbol: 'BTCDOMUSDT', baseAsset: 'BTCDOM', quoteAsset: 'USDT' },
    { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
    { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
  ];
  assert.deepEqual(searchSurveillanceSymbols('btc', list).map(x => x.symbol),
    ['BTCUSDT', 'BTCDOMUSDT', '1000BTCUSDT']);
  assert.deepEqual(searchSurveillanceSymbols('BTC/USDT', list).map(x => x.symbol), ['BTCUSDT']);
  assert.deepEqual(searchSurveillanceSymbols('BTCUSDT', list).map(x => x.symbol), ['BTCUSDT']);
  assert.deepEqual(searchSurveillanceSymbols('BTCD', list).map(x => x.symbol), ['BTCDOMUSDT']);
  assert.deepEqual(searchSurveillanceSymbols('btc', list, 1).map(x => x.symbol), ['BTCUSDT']);
});

test('symbol suggestions respect the selected exchange and market universe', () => {
  const binanceFutures = [
    { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
    { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
  ];
  const bybitSpot = [
    { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
    { symbol: 'BTCUSDC', baseAsset: 'BTC', quoteAsset: 'USDC' },
  ];
  assert.deepEqual(searchSurveillanceSymbols('BTC', binanceFutures).map(x => x.symbol), ['BTCUSDT']);
  assert.deepEqual(searchSurveillanceSymbols('BTC', bybitSpot), [],
    'another market cannot supply a pair that is not listed in this one');
  assert.deepEqual(searchSurveillanceSymbols('BTC', []), []);
  assert.deepEqual(searchSurveillanceSymbols('BTC!', binanceFutures), []);
});

test('multi-character and non-Latin base assets work without explicit USDT', () => {
  const catalog = [
    { symbol: 'XUSDT', baseAsset: 'X', quoteAsset: 'USDT' },
    { symbol: '龙虾USDT', baseAsset: '龙虾', quoteAsset: 'USDT' },
    { symbol: '1000PEPEUSDT', baseAsset: '1000PEPE', quoteAsset: 'USDT' },
  ];
  assert.deepEqual(searchSurveillanceSymbols('X', catalog).map(x => x.symbol), ['XUSDT']);
  assert.deepEqual(searchSurveillanceSymbols('龙虾', catalog).map(x => x.symbol), ['龙虾USDT']);
  assert.deepEqual(searchSurveillanceSymbols('PEPE', catalog).map(x => x.symbol), ['1000PEPEUSDT']);
});
