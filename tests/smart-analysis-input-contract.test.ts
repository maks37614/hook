import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ScannedCoin, Timeframe } from '../src/types';
import { buildSmartAnalysisQuery } from '../src/utils/smartAnalysisRequest';

type Instrument = Pick<ScannedCoin, 'symbol' | 'exchange' | 'marketType' | 'timeframe'>;
const coin: Instrument = {
  symbol: 'BTC/USDT', exchange: 'binance', marketType: 'futures', timeframe: '1h',
};

test('BTC/USDT details send normalized exchange symbol and real exchange timeframe', () => {
  const params = buildSmartAnalysisQuery(coin, '5m');
  assert.equal(params.get('symbol'), 'BTCUSDT');
  assert.equal(params.get('exchange'), 'binance');
  assert.equal(params.get('marketType'), 'futures');
  assert.equal(params.get('timeframe'), '5m');
  assert.equal(params.get('price'), null,
    'remote Quant always verifies the real last closed exchange candle');
});

test('Terminal 30s switches remote Quant to actual 1m exchange history', () => {
  const params = buildSmartAnalysisQuery({ ...coin, timeframe: '30s' });
  assert.equal(params.get('timeframe'), '1m');
  assert.equal(buildSmartAnalysisQuery(coin, '30s').get('timeframe'), '1m');
  for (const tf of ['1m', '5m', '15m', '1h', '4h', '1d'] as Timeframe[]) {
    assert.equal(buildSmartAnalysisQuery(coin, tf).get('timeframe'), tf);
  }
  assert.equal(buildSmartAnalysisQuery(coin, '24h' as Timeframe).get('timeframe'), '1h',
    'an old unsupported saved timeframe must not produce HTTP 400');
});

test('24h reference screen can analyze an absent live price without sending NaN', () => {
  const stale = { ...coin, currentPrice: Number.NaN } as Instrument & { currentPrice: number };
  const params = buildSmartAnalysisQuery(stale);
  assert.equal(params.get('price'), null);
  assert.equal(params.get('timeframe'), '1h');
});

test('international exchange symbols use the same normalization as charts', () => {
  assert.equal(buildSmartAnalysisQuery({ ...coin, symbol: '龙虾/USDT' }).get('symbol'), '龙虾USDT');
  assert.equal(buildSmartAnalysisQuery({ ...coin, symbol: 'ETH-USDT' }).get('symbol'), 'ETHUSDT');
});

test('invalid instruments fail locally instead of spending VPS exchange budget', () => {
  assert.throws(() => buildSmartAnalysisQuery({ ...coin, symbol: '!!' }), /символ/);
  assert.throws(() => buildSmartAnalysisQuery({ ...coin, exchange: 'okx' as any }), /біржа/);
  assert.throws(() => buildSmartAnalysisQuery({ ...coin, marketType: 'swap' as any }), /ринку/);
});

test('UI and server share symbol normalization, with no extra market calls', () => {
  const ui = readFileSync(new URL('../src/components/SmartAnalysisBlock.tsx', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../server/smartAnalysisService.ts', import.meta.url), 'utf8');
  assert.match(ui, /buildSmartAnalysisQuery\(coin, timeframe\)/);
  assert.match(ui, /fetch\(`\/api\/market\/smart-analysis\?\$\{queryParams\.toString\(\)\}`/);
  assert.doesNotMatch(ui, /price: String\(coin\.currentPrice\)/);
  assert.match(server, /const symbol = normalizeExchangeSymbol\(rawSymbol\)/);
  assert.match(server, /if \(!isValidExchangeSymbol\(symbol\)/);
  assert.match(server, /INVALID_ANALYSIS_INPUT/);
  assert.match(service, /const currentPrice = klines\[klines\.length - 1\]\.close/);
});
