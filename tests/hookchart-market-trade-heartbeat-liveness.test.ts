import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeMarketTrades } from '../src/components/hookchart/marketTradeStream';

class FakeTradeSocket {
  static readonly OPEN = 1;
  static instances: FakeTradeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) { FakeTradeSocket.instances.push(this); }
  open() { this.readyState = FakeTradeSocket.OPEN; this.onopen?.(); }
  emit(data: object) { this.onmessage?.({ data: JSON.stringify(data) }); }
  send(data: string) { this.sent.push(data); }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }
}

function withMarketNetwork(t: any, exchange: 'binance' | 'bybit', symbol: string) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 1_800_000_000_000 });
  const originalFetch = globalThis.fetch;
  const originalSocket = globalThis.WebSocket;
  FakeTradeSocket.instances = [];
  globalThis.fetch = async () => exchange === 'binance'
    ? Response.json([])
    : Response.json({ retCode: 0, result: { list: [] } });
  globalThis.WebSocket = FakeTradeSocket as unknown as typeof WebSocket;
  const trades: string[] = [];
  const stop = subscribeMarketTrades({ exchange, marketType: 'futures', symbol }, {
    onTrade: row => trades.push(row.id), onPrints: () => {},
  });
  t.after(() => {
    stop();
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalSocket;
  });
  return { sockets: FakeTradeSocket.instances, trades, stop };
}

for (const exchange of ['binance', 'bybit'] as const) {
  test(`${exchange}: a WebSocket that never opens is closed and replaced after the handshake deadline`, t => {
    const f = withMarketNetwork(t, exchange, `STUCKOPEN${exchange.toUpperCase()}USDT`);
    const first = f.sockets[0];
    assert.ok(first);
    t.mock.timers.tick(14_000);
    assert.equal(first.closed, false);
    t.mock.timers.tick(1_000);
    assert.equal(first.closed, true, 'the open deadline must not depend on browser close events');
    t.mock.timers.tick(2_000);
    assert.equal(f.sockets.length, 2, 'a replacement socket should open with retry backoff');
    f.stop();
    t.mock.timers.tick(120_000);
    assert.equal(f.sockets.length, 2, 'final unsubscribe cancels all timers');
  });
}

test('an open, illiquid Binance aggTrade stream is not disconnected just because no trades arrive', t => {
  const f = withMarketNetwork(t, 'binance', 'ILLIQUIDBINANCEUSDT');
  const socket = f.sockets[0];
  socket.open();
  t.mock.timers.tick(4 * 60_000);
  assert.equal(socket.closed, false, 'Binance trade frames have no minimum cadence');
  assert.equal(f.sockets.length, 1);
  assert.equal(socket.sent.length, 0, 'browser-level Binance ping/pong requires no application pings');
});

test('Bybit ping acknowledgements keep a trade-free socket alive; missing replies cause one reconnect', t => {
  const f = withMarketNetwork(t, 'bybit', 'ILLIQUIDBYBITUSDT');
  const socket = f.sockets[0];
  socket.open();
  assert.ok(socket.sent.some(value => JSON.parse(value).op === 'subscribe'));

  t.mock.timers.tick(20_000);
  assert.equal(socket.sent.filter(value => JSON.parse(value).op === 'ping').length, 1);
  socket.emit({ op: 'ping', success: true, ret_msg: 'pong' });
  t.mock.timers.tick(20_000);
  socket.emit({ op: 'pong', args: [String(Date.now())] });
  t.mock.timers.tick(40_000);
  assert.equal(socket.closed, false, 'documented Bybit pong variants prove liveness with zero trades');

  // No further replies: outgoing heartbeats are insufficient proof of health.
  t.mock.timers.tick(20_000);
  assert.equal(socket.closed, true, 'a socket ignoring heartbeats must be retired');
  assert.ok(socket.sent.some(value => JSON.parse(value).op === 'ping'));
  t.mock.timers.tick(2_000);
  assert.equal(f.sockets.length, 2);
  const replacement = f.sockets[1];
  replacement.open();
  const previousPings = replacement.sent.filter(value => JSON.parse(value).op === 'ping').length;
  socket.onclose?.();
  t.mock.timers.tick(20_000);
  assert.equal(replacement.sent.filter(value => JSON.parse(value).op === 'ping').length, previousPings + 1,
    'a late close from an obsolete socket must not disable the replacement heartbeat');
  f.stop();
  t.mock.timers.tick(200_000);
  assert.equal(f.sockets.length, 2, 'unmounted charts must not reconnect');
});

test('valid Bybit trade frames count as liveness even without pong; irrelevant or rejected frames do not', t => {
  const f = withMarketNetwork(t, 'bybit', 'TRADESBYBITUSDT');
  const socket = f.sockets[0];
  socket.open();
  t.mock.timers.tick(40_000);
  socket.emit({
    topic: 'publicTrade.TRADESBYBITUSDT',
    data: [{ T: Date.now(), p: '1.2', v: '10', S: 'Buy', i: 'new-trade' }],
  });
  t.mock.timers.tick(40_000);
  assert.equal(socket.closed, false, 'live executions prove transport liveness');
  socket.emit({ topic: 'publicTrade.OTHERUSDT', data: [] });
  socket.emit({ op: 'ping', success: false, ret_msg: 'pong' });
  t.mock.timers.tick(20_000);
  assert.equal(socket.closed, true, 'unrelated and failed acknowledgements must not hide a dead feed');
});

test('Bybit rejected subscribe response starts recovery instead of lingering with a ping loop', t => {
  const f = withMarketNetwork(t, 'bybit', 'REJECTEDBYBITUSDT');
  const socket = f.sockets[0];
  socket.open();
  socket.emit({ op: 'subscribe', success: false, ret_msg: 'invalid symbol' });
  assert.equal(socket.closed, true);
  t.mock.timers.tick(2_000);
  assert.equal(f.sockets.length, 2);
  f.stop();
  t.mock.timers.tick(120_000);
  assert.equal(f.sockets.length, 2);
});
