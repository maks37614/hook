import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { installPaperFeed } from '../server/paperFeed';
import { getPaperFormationSnapshots } from '../server/marketService';

test('paper feed is disabled by default, uses a separate credential and never starts scans', async () => {
  const previous = process.env.HOOK_PAPER_FEED_TOKEN;
  const app = express(); installPaperFeed(app);
  app.use('/api', (_req, res) => { res.sendStatus(401); });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = (token = '') => fetch(base + '/api/paper/formations', { headers: { Authorization: `Bearer ${token}` } });
  try {
    delete process.env.HOOK_PAPER_FEED_TOKEN;
    assert.equal((await request()).status, 503);
    process.env.HOOK_PAPER_FEED_TOKEN = 'x'.repeat(64);
    assert.equal((await request()).status, 401);
    assert.equal((await request('wrong')).status, 401);
    for (const query of ['watch=' + Array.from({length:13},()=> 'binance:futures:BTCUSDT').join(','), 'watch=binance:futures:BTCUSDT/../../x', 'tfs=2m', 'watch[]=binance:futures:BTCUSDT']) {
      const response = await fetch(base+'/api/paper/formations?'+query,{headers:{Authorization:`Bearer ${'x'.repeat(64)}`}});
      assert.equal(response.status,400,query);
    }
    const before = getPaperFormationSnapshots();
    const result = await request('x'.repeat(64));
    assert.equal(result.status, before.length ? 200 : 503);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    const body = await result.json();
    assert.deepEqual(body.snapshots, before);
    assert.deepEqual(getPaperFormationSnapshots(), before, 'reading the feed must not populate scan cache');
    assert.equal((await fetch(base + '/api/screener/scan', { headers: { Authorization: `Bearer ${'x'.repeat(64)}` } })).status, 401);
  } finally {
    if (previous === undefined) delete process.env.HOOK_PAPER_FEED_TOKEN; else process.env.HOOK_PAPER_FEED_TOKEN = previous;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

import { getPaperMarketSnapshot, fetchKlines } from '../server/marketService';
import { configureExchangeGateway } from '../server/exchangeGateway';
import { MarketTickerFeed } from '../server/marketTickerFeed';

test('market export reuses existing candle cache, preserves source time and cannot perform network work', async () => {
  let calls = 0;
  const stamp = Math.floor(Date.now() / 60_000) * 60;
  configureExchangeGateway({ request: async () => {
    calls++;
    return new Response(JSON.stringify(Array.from({ length: 40 }, (_, i) => [(stamp - (40-i)*60)*1000, '100','101','99','100','10'])), { headers: { 'content-type':'application/json' } });
  }, spacingMs: 0 });
  try {
    await fetchKlines('binance','futures','BTCUSDT','1m',70);
    assert.equal(calls, 1);
    const first = getPaperMarketSnapshot(['binance:futures:BTCUSDT'], ['1m']);
    assert.equal(first.series.length, 1);
    assert.equal(first.series[0].candles.length, 40);
    assert.equal(first.series[0].candles[0][0], stamp - 40*60);
    const originalTime = first.series[0].updatedAt;
    for (let i=0; i<5; i++) assert.equal(getPaperMarketSnapshot(['binance:futures:BTCUSDT'],['1m']).series[0].updatedAt, originalTime);
    assert.equal(calls, 1, 'export never fetches or refreshes a source');
    assert.equal(getPaperMarketSnapshot(['bybit:futures:BTCUSDT'],['1m']).series.length, 0);
    assert.equal(getPaperMarketSnapshot(['binance:futures:BTCUSDT'],['5m']).series.length, 0);
    assert.equal(getPaperMarketSnapshot(['binance:futures:BTCUSDT'],['1m'], Date.now()+181_000).series.length, 0);
  } finally { configureExchangeGateway({}); }
});

test('ticker cache export is read-only and retains the actual collected timestamp', async () => {
  let calls=0; let clock=Date.now();
  const feed=new MarketTickerFeed(async () => { calls++;return new Response(JSON.stringify([{symbol:'BTCUSDT',lastPrice:'100',priceChangePercent:'1',quoteVolume:'1000000',highPrice:'110',lowPrice:'90'}]),{headers:{'content-type':'application/json'}}); },()=>clock);
  assert.deepEqual(feed.cached(),[]);assert.equal(calls,0);
  await feed.get('binance','futures'); const when=feed.cached()[0].updatedAt;
  clock+=300_000;
  assert.equal(feed.cached()[0].updatedAt,when);assert.equal(calls,1);
  assert.equal(feed.cached()[0].data[0].symbol,'BTCUSDT');
});
