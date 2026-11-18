import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { BinanceTickerStream } from '../server/binanceTickerStream';
import { PublicPriceFeed } from '../server/publicPriceFeed';

class FakeSocket extends EventEmitter {
  readyState: number = WebSocket.CONNECTING;
  constructor(readonly url: string) { super(); }
  open() { this.readyState = WebSocket.OPEN; this.emit('open'); }
  message(value: unknown) { this.emit('message', Buffer.from(JSON.stringify(value))); }
  close() { this.readyState = WebSocket.CLOSED; this.emit('close'); }
  terminate() { this.close(); }
}

test('one Binance WS per spot/futures scope also feeds all server alert users', () => {
  const sockets: FakeSocket[] = [];
  const publicPriceFeed = new PublicPriceFeed(
    () => { throw new Error('external Binance sink must not open another socket'); },
    Date.now, true, true);
  const stream = new BinanceTickerStream(url => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket as unknown as WebSocket;
  }, true, publicPriceFeed);
  const b = { exchange: 'binance' as const, market: 'futures' as const, symbol: 'BTCUSDT' };
  const e = { exchange: 'binance' as const, market: 'futures' as const, symbol: 'ETHUSDT' };
  publicPriceFeed.watch([b, b, e]);
  try {
    stream.start();
    assert.equal(sockets.length, 2, 'exactly one spot and one futures connection');
    const futures = sockets.find(s => s.url.includes('fstream.binance.com'));
    assert.ok(futures);
    assert.match(futures.url, /\/market\/ws\/!miniTicker@arr$/);
    futures.open();
    futures.message([
      { s: 'BTCUSDT', c: '111', st: 1, o: '100', h: '120', l: '90', q: '10000' },
      { s: 'ETHUSDT', c: '999', st: 2, o: '100', h: '1000', l: '90', q: '10000' },
    ]);
    assert.equal(publicPriceFeed.current(b), 111);
    assert.equal(publicPriceFeed.current(e), null, 'COIN-M ticker is not a USD-M alert');
    futures.close();
    assert.equal(publicPriceFeed.current(b), null, 'lost connection invalidates old alerts');
  } finally {
    stream.stop();
    publicPriceFeed.watch([]);
    publicPriceFeed.setBinanceConnection('futures', false);
    publicPriceFeed.setBinanceConnection('spot', false);
    publicPriceFeed.close();
  }
});
