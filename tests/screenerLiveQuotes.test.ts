import assert from 'node:assert/strict';
import test from 'node:test';
import type { MarketCoin } from '../src/types';
import { applyScreenerLiveQuotes, readScreenerLiveQuotePacket,
  liveQuotesForReconciledSnapshot,
  SCREENER_FULL_REFRESH_MS, screenerLiveScopeKey, screenerVisibleScopes } from '../src/utils/screenerLiveQuotes';
import { BybitVisibleTickerSource, installScreenerLiveQuotes, parseScreenerSubscription } from '../server/screenerLiveQuotes';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { MarketTickerFeed, type RawTicker } from '../server/marketTickerFeed';

const coin = (symbol: string, exchange: 'binance' | 'bybit' = 'binance',
  marketType: 'futures' | 'spot' = 'futures'): MarketCoin => ({
  symbol, exchange, marketType, baseAsset: symbol.replace(/USDT$/, ''),
  quoteAsset: 'USDT', price: 100, change24h: 1, volumeUsd: 50_000_000,
  high24h: 110, low24h: 90, volatility24hPct: 22.22, volatility5mPct: 0.5,
  distanceToHighPct: 9.09, distanceToLowPct: 11.11,
  isNearHigh: false, isNearLow: false, isActiveCoin: false, exchangeUrl: '',
});

test('Screener catalog refreshes every 40 seconds and WS tracks visible rows', () => {
  assert.equal(SCREENER_FULL_REFRESH_MS, 40_000);
  const all = Array.from({ length: 150 }, (_, i) => coin('TEST' + i + 'USDT'));
  const visible = screenerVisibleScopes(all, 1000);
  assert.equal(visible.length, 100);
  assert.equal(screenerVisibleScopes(all, 0).length, 0);
});

test('Live quote packets reject malformed, stale and negative volume values', () => {
  const at = Date.now();
  const row = { exchange: 'binance', marketType: 'futures', symbol: 'BTCUSDT',
    price: 102, change24h: 2.25, volumeUsd: 52_000_000, high24h: 110, low24h: 90 };
  assert.deepEqual(readScreenerLiveQuotePacket({ type: 'quotes', at,
    rows: [row] }).map(item => item.price), [102]);
  assert.equal(readScreenerLiveQuotePacket({ type: 'quotes', at: at - 30_000,
    rows: [row] }).length, 0);
  assert.equal(readScreenerLiveQuotePacket({ type: 'quotes', at,
    rows: [{ ...row, volumeUsd: -1 }] }).length, 0);
  assert.equal(readScreenerLiveQuotePacket({ type: 'quotes', at,
    rows: [{ ...row, symbol: '../../../' }] }).length, 0);
});

test('Live prices, percentage, volume and range update without losing historical metadata', () => {
  const original = coin('BTCUSDT');
  original.isNearHigh = true;
  original.volatility5mPct = 2.5;
  const second = coin('ETHUSDT', 'bybit');
  const patched = applyScreenerLiveQuotes([original, second], [{
    exchange: 'binance', marketType: 'futures', symbol: 'BTCUSDT',
    price: 105, change24h: 4, volumeUsd: 55_000_000, high24h: 111, low24h: 93,
  }]);
  assert.equal(patched[0].price, 105);
  assert.equal(patched[0].change24h, 4);
  assert.equal(patched[0].volumeUsd, 55_000_000);
  assert.equal(patched[0].volatility5mPct, 2.5);
  assert.equal(patched[0].isNearHigh, true);
  assert.equal(patched[1], second);
  assert.equal(applyScreenerLiveQuotes(patched, []), patched);
  assert.equal(screenerLiveScopeKey(original), 'binance:futures:BTCUSDT');
});

test('Screener subscription rejects large, malformed or private topics', () => {
  assert.deepEqual(parseScreenerSubscription({
    type: 'subscribe', scopes: [
      { exchange: 'bybit', marketType: 'spot', symbol: 'BTCUSDT' },
      { exchange: 'bybit', marketType: 'spot', symbol: 'BTCUSDT' },
    ],
  }), [{ exchange: 'bybit', marketType: 'spot', symbol: 'BTCUSDT' }]);
  assert.equal(parseScreenerSubscription({ type: 'subscribe',
    scopes: [{ exchange: 'bybit', marketType: 'private', symbol: 'BTCUSDT' }] }), null);
  assert.equal(parseScreenerSubscription({ type: 'subscribe',
    scopes: Array.from({ length: 101 }, () => ({
      exchange: 'binance', marketType: 'spot', symbol: 'BTCUSDT',
    })) }), null);
});

test('Cached full HTTP snapshot cannot roll back just-arrived WS prices', () => {
  const requestAt = Date.now();
  const quote = { exchange: 'binance' as const, marketType: 'futures' as const,
    symbol: 'BTCUSDT', price: 111, change24h: 2, volumeUsd: 4000000,
    high24h: 120, low24h: 90 };
  const beforeHttp = liveQuotesForReconciledSnapshot(
    [{ quote, at: requestAt - 1500 }], requestAt, requestAt + 200,
  );
  assert.equal(beforeHttp.length, 1);
  assert.equal(applyScreenerLiveQuotes([coin('BTCUSDT')], beforeHttp)[0].price, 111);
  assert.equal(liveQuotesForReconciledSnapshot(
    [{ quote, at: requestAt - 3500 }], requestAt, requestAt + 200,
  ).length, 0, 'do not override a newer REST result with arbitrarily old WS data');
});

test('Binance out-of-order miniTicker frames never overwrite a newer price', async () => {
  let now = Date.now();
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify([{
    symbol: 'BTCUSDT', lastPrice: '100', priceChangePercent: '1',
    quoteVolume: '1000000', highPrice: '115', lowPrice: '90',
  }]), { headers: { 'Content-Type': 'application/json' } });
  const feed = new MarketTickerFeed(fakeFetch, () => now);
  await feed.get('binance', 'spot');
  const published: number[] = [];
  const off = feed.subscribeLive(rows => published.push(...rows.map(row => row.price)));
  const packet = (price: number, at: number) => ({
    s: 'BTCUSDT', c: String(price), o: '100', q: '1000000',
    h: '115', l: '90', E: at,
  });
  try {
    feed.applyBinanceMiniTickers('spot', [packet(110, now)]);
    feed.applyBinanceMiniTickers('spot', [packet(90, now - 1500)]);
    assert.equal((await feed.get('binance', 'spot'))[0].price, 110);
    assert.deepEqual(published, [110]);
    feed.applyBinanceMiniTickers('spot', [packet(110, now)]);
    assert.deepEqual(published, [110], 'unchanged quotes must not repaint the table');
  } finally { off(); }
});

test('Bybit ticker deltas retain omitted 24h fields, ignore unknown symbols and reconcile newer WS changes', async () => {
  let now = Date.now();
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
    retCode: 0, result: { list: [{
      symbol: 'BTCUSDT', lastPrice: '100', price24hPcnt: '0.01',
      turnover24h: '100000', highPrice24h: '111', lowPrice24h: '90',
      openInterestValue: '5000000', fundingRate: '0.0001',
    }] },
  }), { headers: { 'Content-Type': 'application/json' } });
  const ticker = new MarketTickerFeed(fakeFetch, () => now);
  await ticker.get('bybit', 'futures');
  const received: string[] = [];
  const off = ticker.subscribeLive(updates => received.push(...updates.map(item => item.symbol)));
  assert.equal(ticker.applyBybitTicker('futures', { symbol: 'BTCUSDT', lastPrice: '105' }, now), true);
  assert.equal(ticker.applyBybitTicker('futures', { symbol: 'BTCUSDT', lastPrice: '99' }, now - 1), false,
    'an older Bybit tick must never overwrite the latest quote');
  assert.equal(ticker.applyBybitTicker('futures', { symbol: 'BTCUSDT', lastPrice: '-5' }, now), false);
  assert.equal(ticker.applyBybitTicker('futures', { symbol: 'ETHUSDT', lastPrice: '100' }, now), false);
  const latest = await ticker.get('bybit', 'futures');
  assert.equal(latest[0].price, 105);
  assert.equal(latest[0].high24h, 111);
  assert.equal(latest[0].openInterestUsd, 5_000_000);
  assert.deepEqual(received, ['BTCUSDT']);
  off();
});

test('A complete subscribed Bybit WS snapshot works even when VPS REST is blocked', async () => {
  const now = Date.now();
  const deniedFetch: typeof fetch = async () => new Response('denied', { status: 403 });
  const feed = new MarketTickerFeed(deniedFetch, () => now);
  const received: string[] = [];
  const stop = feed.subscribeLive(rows => received.push(...rows.map(row => row.symbol)));
  try {
    assert.deepEqual(await feed.get('bybit', 'futures'), []);
    assert.equal(feed.applyBybitTicker('futures', {
      symbol: 'BTCUSDT', lastPrice: '100', price24hPcnt: '0.01',
      turnover24h: '900000', highPrice24h: '120', lowPrice24h: '90',
    }, now), true);
    assert.deepEqual(received, ['BTCUSDT']);
    assert.equal(feed.applyBybitTicker('futures', {
      symbol: 'UNKNOWNUSDT', lastPrice: '100',
    }, now), false, 'incomplete WS deltas cannot fabricate a listing');
    assert.equal(feed.status('bybit', 'futures').status, 'unavailable',
      'a single live symbol cannot certify the whole exchange universe');
  } finally { stop(); }
});

test('Bybit full catalog is re-fetched at 40 seconds even when status is still fresh', async () => {
  let now = Date.now();
  let requests = 0;
  const fakeFetch: typeof fetch = async () => {
    requests++;
    return new Response(JSON.stringify({ retCode: 0, result: { list: [{
      symbol: 'BTCUSDT', lastPrice: String(100 + requests),
      price24hPcnt: '0.01', turnover24h: '100000',
      highPrice24h: '150', lowPrice24h: '80',
    }] } }), { headers: { 'Content-Type': 'application/json' } });
  };
  const ticker = new MarketTickerFeed(fakeFetch, () => now);
  assert.equal((await ticker.get('bybit', 'spot'))[0].price, 101);
  assert.equal(requests, 1);
  now += 40_000;
  assert.equal(ticker.status('bybit', 'spot').status, 'live');
  assert.equal((await ticker.get('bybit', 'spot'))[0].price, 102);
  assert.equal(requests, 2);
});

test('Bybit visible ticker source shares one market socket and batches spot topics by ten', () => {
  class FakeSocket extends EventEmitter {
    readyState = 0;
    sent: Array<{ op: string; args: string[] }> = [];
    send(message: string) { this.sent.push(JSON.parse(message)); }
    close() { this.readyState = 3; this.emit('close'); }
    open() { this.readyState = 1; this.emit('open'); }
  }
  const connections: FakeSocket[] = [];
  const updated: string[] = [];
  const source = new BybitVisibleTickerSource({
    applyBybitTicker: (_market, quote) => {
      updated.push(String(quote.symbol));
      return true;
    },
  }, _url => {
    const fake = new FakeSocket();
    connections.push(fake);
    return fake as unknown as WebSocket;
  }, 100);
  try {
    const symbols = new Set(Array.from({ length: 27 }, (_, i) => 'COIN' + i + 'USDT'));
    source.setWanted('spot', symbols);
    assert.equal(connections.length, 1);
    connections[0].open();
    const subscriptions = connections[0].sent.filter(item => item.op === 'subscribe');
    assert.deepEqual(subscriptions.map(row => row.args.length), [10, 10, 7]);
    assert.equal(source.stats().spot, 27);
    connections[0].emit('message', Buffer.from(JSON.stringify({
      topic: 'tickers.COIN0USDT', type: 'snapshot', ts: Date.now(),
      data: { symbol: 'COIN0USDT', lastPrice: '100' },
    })));
    assert.deepEqual(updated, ['COIN0USDT']);
    source.setWanted('spot', new Set(['COIN0USDT']));
    assert.equal(connections.length, 1, 'new selection must reuse the current upstream WS');
    assert.equal(connections[0].sent.filter(row => row.op === 'unsubscribe').length, 3);
  } finally { source.stop(); }
});


test('Screener relay does no ticker-processing or timer work with zero connected viewers', async () => {
  let started = 0, stopped = 0;
  const listeners = new Set<(rows: RawTicker[]) => void>();
  const feed = {
    subscribeLive: (listener: (rows: RawTicker[]) => void) => {
      started++;
      listeners.add(listener);
      return () => {
        if (listeners.delete(listener)) stopped++;
      };
    },
  };
  const server = createServer((_req, res) => res.end());
  const relay = installScreenerLiveQuotes(server, feed);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  const url = 'ws://127.0.0.1:' + address.port + '/api/screener/live-quotes';
  const sockets: WebSocket[] = [];
  const waitFor = async (predicate: () => boolean) => {
    const limit = Date.now() + 2000;
    while (!predicate() && Date.now() < limit)
      await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(predicate(), 'Screener relay transition timed out');
  };
  const connect = async () => {
    const ws = new WebSocket(url);
    sockets.push(ws);
    await once(ws, 'open', { signal: AbortSignal.timeout(2000) });
    return ws;
  };
  try {
    assert.equal(started, 0, 'idle relay must not subscribe to all ticker updates');
    assert.equal(listeners.size, 0);
    assert.equal(relay.stats().clients, 0);
    const first = await connect();
    await waitFor(() => started === 1);
    assert.equal(listeners.size, 1);
    const second = await connect();
    assert.equal(started, 1, 'several viewers must share one listener');
    first.send(JSON.stringify({
      type: 'subscribe',
      scopes: [{ exchange: 'binance', marketType: 'futures', symbol: 'BTCUSDT' }],
    }));
    await waitFor(() => relay.stats().subscriptions === 1);
    const message = once(first, 'message', { signal: AbortSignal.timeout(3000) });
    const quote = {
      symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT',
      exchange: 'binance' as const, marketType: 'futures' as const,
      price: 101, change24h: 1, volumeUsd: 200_000,
      high24h: 104, low24h: 97,
    };
    for (const listener of listeners) listener([quote]);
    const [raw] = await message;
    const packet = JSON.parse(Buffer.from(raw).toString('utf8'));
    assert.equal(packet.rows[0].symbol, 'BTCUSDT');
    assert.equal(packet.rows[0].price, 101);
    first.close();
    await waitFor(() => relay.stats().clients === 1);
    assert.equal(stopped, 0, 'remaining viewer must continue receiving updates');
    second.close();
    await waitFor(() => relay.stats().clients === 0 && stopped === 1);
    assert.equal(listeners.size, 0, 'last disconnect must detach ticker subscriber');

    const again = await connect();
    await waitFor(() => started === 2);
    assert.equal(listeners.size, 1, 'new viewer must restore live updates');
    again.close();
    await waitFor(() => stopped === 2);
  } finally {
    relay.close();
    for (const socket of sockets) {
      if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
    }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
