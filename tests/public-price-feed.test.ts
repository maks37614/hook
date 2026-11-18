import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { PublicPriceFeed } from '../server/publicPriceFeed';

class FakeSocket extends EventEmitter {
  readyState: number = WebSocket.CONNECTING;
  sent: string[] = [];
  constructor(public url: string) { super(); }
  open() { this.readyState = WebSocket.OPEN; this.emit('open'); }
  send(data: string) { this.sent.push(data); }
  message(data: unknown) { this.emit('message', Buffer.from(JSON.stringify(data))); }
  close() { this.readyState = WebSocket.CLOSED; this.emit('close'); }
}

test('one Binance futures socket serves many alert users for the same market', () => {
  const created: FakeSocket[] = [];
  let clock = 1_000;
  const feed = new PublicPriceFeed(url => {
    const socket = new FakeSocket(url);
    created.push(socket);
    return socket as unknown as WebSocket;
  }, () => clock, true);
  const btc = { exchange: 'binance' as const, market: 'futures' as const, symbol: 'BTCUSDT' };
  feed.watch([btc, btc, btc]);
  assert.equal(created.length, 1);
  assert.match(created[0].url, /fstream\.binance\.com/);
  created[0].open();
  created[0].message([{ s: 'BTCUSDT', c: '100.25' }, { s: 'ETHUSDT', c: '800' }]);
  assert.equal(feed.current(btc), 100.25);
  clock += 16_000;
  assert.equal(feed.current(btc), null, 'stale prices must be read via the REST fallback');
  feed.close();
  assert.equal(created[0].readyState, WebSocket.CLOSED);
});

test('Bybit ticker delta can omit unchanged price, and subscription messages are batched', () => {
  const created: FakeSocket[] = [];
  let clock = 1_000;
  const feed = new PublicPriceFeed(url => {
    const s = new FakeSocket(url); created.push(s); return s as unknown as WebSocket;
  }, () => clock, true);
  const btc = { exchange: 'bybit' as const, market: 'futures' as const, symbol: 'BTCUSDT' };
  feed.watch([btc]);
  assert.equal(created.length, 1);
  created[0].open();
  assert.equal(JSON.parse(created[0].sent[0]).args[0], 'tickers.BTCUSDT');
  created[0].message({ topic: 'tickers.BTCUSDT', type: 'snapshot', data: { lastPrice: '120' } });
  assert.equal(feed.current(btc), 120);
  clock += 3_000;
  created[0].message({ topic: 'tickers.BTCUSDT', type: 'delta', data: { fundingRate: '0.0001' } });
  assert.equal(feed.current(btc), 120);
  feed.watch([]);
  assert.equal(feed.current(btc), null);
  assert.equal(created[0].readyState, WebSocket.CLOSED);
  feed.close();
});

test('invalid and unrequested prices never enter the shared alert feed', () => {
  const created: FakeSocket[] = [];
  const feed = new PublicPriceFeed(url => {
    const s = new FakeSocket(url); created.push(s); return s as unknown as WebSocket;
  }, Date.now, true);
  const instrument = { exchange: 'binance' as const, market: 'spot' as const, symbol: 'BTCUSDT' };
  feed.watch([instrument]);
  created[0].open();
  created[0].message([{ s: 'BTCUSDT', c: '-100' }, { s: 'ETHUSDT', c: '11' }]);
  assert.equal(feed.current(instrument), null);
  created[0].message([{ s: 'BTCUSDT', c: '123.40' }]);
  assert.equal(feed.current(instrument), 123.4);
  feed.close();
});

test('production-mode Binance alerts reuse existing market WS and invalidate after disconnect', () => {
  let clock = 1_000;
  const feed = new PublicPriceFeed(() => { throw new Error('duplicate socket must not open'); },
    () => clock, true, true);
  const btc = { exchange: 'binance' as const, market: 'futures' as const, symbol: 'BTCUSDT' };
  const eth = { exchange: 'binance' as const, market: 'futures' as const, symbol: 'ETHUSDT' };
  feed.watch([btc, eth]);
  feed.setBinanceConnection('futures', true);
  feed.ingestBinanceTicks('futures', [
    { s: 'BTCUSDT', st: 1, c: '123' },
    { s: 'ETHUSDT', st: 2, c: '999' },
  ]);
  assert.equal(feed.current(btc), 123);
  assert.equal(feed.current(eth), null, 'merged COIN-M tick must never be treated as USD-M');
  feed.setBinanceConnection('futures', false);
  assert.equal(feed.current(btc), null, 'old price invalid immediately on disconnect');
  clock += 1_000;
  feed.setBinanceConnection('futures', true);
  assert.equal(feed.current(btc), null, 'connection open without a fresh tick is not live data');
  feed.ingestBinanceTicks('futures', [{ s: 'BTCUSDT', st: 1, c: '125' }]);
  assert.equal(feed.current(btc), 125);
  feed.close();
});

test('Bybit reconnect cannot reuse a price from the previous connection', () => {
  const created: FakeSocket[] = [];
  const feed = new PublicPriceFeed(url => {
    const socket = new FakeSocket(url); created.push(socket); return socket as unknown as WebSocket;
  }, Date.now, true);
  const btc = { exchange: 'bybit' as const, market: 'spot' as const, symbol: 'BTCUSDT' };
  feed.watch([btc]);
  created[0].open();
  created[0].message({ topic: 'tickers.BTCUSDT', type: 'snapshot', data: { lastPrice: '500' } });
  assert.equal(feed.current(btc), 500);
  created[0].close();
  assert.equal(feed.current(btc), null);
  feed.close();
});

test('delayed or future exchange event timestamps cannot trigger false alerts', () => {
  let now = 100_000;
  const feed = new PublicPriceFeed(() => { throw new Error('unexpected direct socket'); },
    () => now, true, true);
  const btc = { exchange: 'binance' as const, market: 'futures' as const, symbol: 'BTCUSDT' };
  feed.watch([btc]);
  feed.setBinanceConnection('futures', true);
  feed.ingestBinanceTicks('futures', [{ s: 'BTCUSDT', st: 1, E: 70_000, c: '90000' }]);
  assert.equal(feed.current(btc), null);
  feed.ingestBinanceTicks('futures', [{ s: 'BTCUSDT', st: 1, E: 105_000, c: '90000' }]);
  assert.equal(feed.current(btc), null);
  feed.ingestBinanceTicks('futures', [{ s: 'BTCUSDT', st: 1, E: 99_500, c: '500' }]);
  assert.equal(feed.current(btc), 500);
  feed.close();
});

test('Bybit old exchange timestamps cannot revive stale alert prices', () => {
  const sockets: FakeSocket[] = [];
  let now = 100_000;
  const feed = new PublicPriceFeed(url => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket as unknown as WebSocket;
  }, () => now, true);
  const btc = { exchange: 'bybit' as const, market: 'futures' as const, symbol: 'BTCUSDT' };
  feed.watch([btc]);
  sockets[0].open();
  sockets[0].message({ topic: 'tickers.BTCUSDT', ts: 1_000, data: { lastPrice: '999' } });
  assert.equal(feed.current(btc), null);
  sockets[0].message({ topic: 'tickers.BTCUSDT', ts: 99_999, data: { lastPrice: '101' } });
  assert.equal(feed.current(btc), 101);
  feed.close();
});

test('emergency WS-alerts-off mode preserves REST fallback by returning no cached WS prices', () => {
  const feed = new PublicPriceFeed(() => { throw new Error('disabled feed must not connect'); },
    Date.now, false, true);
  const btc = { exchange: 'binance' as const, market: 'futures' as const, symbol: 'BTCUSDT' };
  feed.watch([btc]);
  feed.setBinanceConnection('futures', true);
  feed.ingestBinanceTicks('futures', [{ s: 'BTCUSDT', st: 1, c: '200' }]);
  assert.equal(feed.current(btc), null);
  feed.close();
});
