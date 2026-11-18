import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseScreenerScanQuery } from '../server/screenerScanQuery';

test('screener scan keeps existing defaults and valid user filters', () => {
  assert.deepEqual(parseScreenerScanQuery({}), {
    exchange: 'all', marketType: 'all', timeframe: '1h', minVolumeUsd: 50_000,
  });
  assert.deepEqual(parseScreenerScanQuery({
    exchange: 'bybit', marketType: 'spot', timeframe: '5m', minVolume: '100000.5',
  }), { exchange: 'bybit', marketType: 'spot', timeframe: '5m', minVolumeUsd: 100000.5 });
  assert.equal(parseScreenerScanQuery({ minVolume: '0' })?.minVolumeUsd, 0);
  assert.equal(parseScreenerScanQuery({ minVolume: '1e6' })?.minVolumeUsd, 1_000_000);
});

test('invalid query arguments never enqueue market-wide scans', () => {
  for (const input of [
    { exchange: 'unknown' }, { marketType: 'margin' },
    { timeframe: '30s' }, { timeframe: '1mo' },
    { minVolume: 'NaN' }, { minVolume: 'Infinity' },
    { minVolume: '-1' }, { minVolume: '100abcd' },
    { minVolume: '' }, { minVolume: ['1', '2'] },
    { exchange: ['binance', 'bybit'] }, { timeframe: { a: '1h' } },
  ]) assert.equal(parseScreenerScanQuery(input), null, JSON.stringify(input));
});

test('public screener route validates before scheduling costly formation workers', () => {
  const source = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const start = source.indexOf("app.get('/api/screener/scan'");
  const end = source.indexOf("installMarketQuoteRoutes(", start);
  const route = source.slice(start, end);
  assert.match(route, /const query = parseScreenerScanQuery\(req\.query\)/);
  assert.match(route, /if \(!query\) \{\s*return res\.status\(400\)/);
  assert.ok(route.indexOf('parseScreenerScanQuery(req.query)') <
    route.indexOf('runScreenerScan(query)'), 'reject invalid filters before heavy work');
});
