import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import NodeWebSocket from 'ws';
import { installHookChartDepthStream, type ChartDepthSource } from '../server/hookChartDepth';
import { connectHookChartDepth } from '../src/components/hookchart/depthStream';
import { HookChartDensityBook } from '../src/components/hookchart/densityBook';
import { ExchangeStreamClient } from '../server/surveillance/exchangeStream';
import type { BookUpdate } from '../src/utils/binanceOrderBook';
import { chartDepthScope, type ChartDepthPacket, type ChartDepthStatus } from '../src/utils/hookChartDepthProtocol';

class FakeSource extends EventEmitter implements ChartDepthSource {
  status = 'CONNECTING';
  destroyed = false;
  resyncs = 0;
  resyncOrderBook() { this.resyncs++; this.status = 'RESYNCING'; this.emit('status', this.status); }
  destroy() { this.destroyed = true; }
}
const snapshot = (): BookUpdate => ({ isSnapshot: true, sequence: 100, eventTime: Date.now(),
  bids: [[99.9, 1], [99, 2000]], asks: [[100.1, 1], [101, 2000]] });
async function until(condition: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for local depth transport');
}
async function fixture(t: any) {
  const server = createServer((_req, res) => { res.writeHead(404); res.end(); });
  const sources: Array<{ symbol: string; exchange: string; market: string; source: FakeSource }> = [];
  const feed = installHookChartDepthStream(server, (symbol, exchange, market) => {
    const source = new FakeSource(); sources.push({ symbol, exchange, market, source }); return source;
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(async () => { feed.close(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const open = async (query = 'exchange=binance&market=futures&symbol=BTCUSDT') => {
    const client = new NodeWebSocket(origin.replace('http:', 'ws:') + '/api/hookchart/depth?' + query);
    const packets: ChartDepthPacket[] = [];
    client.on('message', data => packets.push(JSON.parse(String(data))));
    await once(client, 'open');
    return { client, packets };
  };
  return { server, sources, feed, origin, open };
}

test('site depth stream shares one real source and gives a late chart a full current snapshot', async t => {
  const f = await fixture(t);
  const one = await f.open('exchange=binance&market=futures&symbol=BTC%2FUSDT');
  await until(() => one.packets.length > 0);
  assert.equal(f.sources.length, 1);
  assert.equal(f.sources[0].symbol, 'BTCUSDT');
  assert.equal(one.packets[0].status, 'CONNECTING');
  f.sources[0].source.emit('depth', snapshot());
  await until(() => one.packets.some(p => p.update?.isSnapshot));
  f.sources[0].source.emit('depth', { sequence: 101, eventTime: Date.now(), bids: [[99, 0], [98, 3000]], asks: [] });
  await until(() => one.packets.some(p => p.update?.sequence === 101));
  const two = await f.open();
  await until(() => two.packets.some(p => p.update?.isSnapshot));
  assert.equal(f.sources.length, 1, 'several charts reuse the same exchange socket');
  const stats = f.feed.stats();
  assert.equal(stats.activeMarkets,1);
  assert.equal(stats.clients,2);
  assert.ok(stats.sentPackets >= 5,'count all delivered WebSocket packets, including status');
  assert.ok(stats.sentBytes > stats.sentPackets,'measure actual serialized bytes sent');
  assert.equal(stats.slowConsumers,0);
  const current = two.packets.find(p => p.update?.isSnapshot)!.update!;
  assert.equal(current.sequence, 101);
  assert.ok(current.bids.some(([p, q]) => p === 98 && q === 3000));
  assert.ok(!current.bids.some(([p]) => p === 99), 'cancelled orders cannot reappear in cached snapshots');
  one.client.close(); await once(one.client, 'close');
  assert.equal(f.sources[0].source.destroyed, false);
  two.client.close(); await once(two.client, 'close');
  await until(() => f.feed.activeMarkets() === 0);
  assert.equal(f.sources[0].source.destroyed, true);
});

test('Binance/Bybit and spot/futures books are isolated and report source errors', async t => {
  const f = await fixture(t);
  const clients = await Promise.all(['binance', 'bybit'].flatMap(exchange => ['spot', 'futures']
    .map(market => f.open(`exchange=${exchange}&market=${market}&symbol=BTCUSDT`))));
  await until(() => f.sources.length === 4);
  assert.equal(new Set(f.sources.map(s => `${s.exchange}:${s.market}`)).size, 4);
  const index = f.sources.findIndex(s => s.exchange === 'bybit' && s.market === 'spot');
  f.sources[index].source.emit('error', new Error('Exchange failed'));
  await until(() => clients.some(c => c.packets.some(p => p.scope === 'bybit:spot:BTCUSDT' && p.status === 'ERROR')));
  assert.ok(clients.every(c => c.packets.every(p => !p.update)));
  const late = await f.open('exchange=bybit&market=spot&symbol=BTCUSDT');
  await until(() => late.packets.some(p => p.status === 'ERROR'));
  assert.equal(f.sources.length, 4);
});

test('the relay rejects deltas without a snapshot, crossed books and obsolete source times', async t => {
  const f = await fixture(t);
  const c = await f.open(); await until(() => f.sources.length === 1);
  const source = f.sources[0].source;
  source.emit('depth', { sequence: 1, bids: [[99, 9999]], asks: [] });
  assert.equal(source.resyncs, 1);
  source.emit('depth', { ...snapshot(), bids: [[110, 9999]] });
  assert.equal(source.resyncs, 2);
  source.emit('depth', { ...snapshot(), eventTime: Date.now() - 10_000 });
  assert.equal(source.resyncs, 3);
  await until(() => c.packets.some(p => p.status === 'RESYNCING'));
  assert.ok(c.packets.every(p => !p.update));
});

test('invalid market requests never create an exchange connection', async t => {
  const f = await fixture(t);
  const c = await f.open('exchange=other&market=futures&symbol=BTCUSDT');
  const [code] = await once(c.client, 'close');
  assert.equal(code, 1008);
  assert.equal(f.sources.length, 0);
});

test('snapshot request failures are reported without an unhandled rejection or a fake live book', async t => {
  const socket = new EventEmitter() as EventEmitter & { close: () => void };
  socket.close = () => {};
  const failure = new Error('Snapshot request failed');
  const errors: unknown[] = [], depths: unknown[] = [];
  const source = new ExchangeStreamClient('BTCUSDT', 'binance', 'futures', true, {
    createWebSocket: () => socket as unknown as NodeWebSocket,
    fetchBook: async () => { throw failure; },
  });
  t.after(() => source.destroy());
  source.on('error', error => errors.push(error));
  source.on('depth', depth => depths.push(depth));
  socket.emit('open');
  await until(() => errors.length > 0);
  assert.equal(errors[0], failure);
  assert.equal(source.status, 'ERROR');
  assert.deepEqual(depths, []);
});

test('an unavailable Binance snapshot reports an error instead of staying in synchronization forever', async t => {
  const socket = new EventEmitter() as EventEmitter & { close: () => void };
  socket.close = () => {};
  const source = new ExchangeStreamClient('BTCUSDT', 'binance', 'futures', true, {
    createWebSocket: () => socket as unknown as NodeWebSocket,
    fetchBook: async () => ({ symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures', bids: [], asks: [], timestamp: Date.now() }),
  });
  t.after(() => source.destroy());
  socket.emit('open');
  await until(() => source.status === 'ERROR');
  assert.equal(source.status, 'ERROR');
});

test('a refused Bybit subscription reports an error instead of waiting for a snapshot that cannot arrive', t => {
  const socket = new EventEmitter() as EventEmitter & { close: () => void; send: () => void };
  socket.close = socket.send = () => {};
  const source = new ExchangeStreamClient('BTCUSDT', 'bybit', 'futures', true, {
    createWebSocket: () => socket as unknown as NodeWebSocket,
  });
  t.after(() => source.destroy());
  socket.emit('open');
  socket.emit('message', Buffer.from(JSON.stringify({ op: 'subscribe', success: false, ret_msg: 'symbol does not exist' })));
  assert.equal(source.status, 'ERROR');
});

for (const exchange of ['binance', 'bybit'] as const) {
  test(`${exchange}: same-origin transport reaches a live chart and removes a cancelled density`, async t => {
    const f = await fixture(t);
    const book = new HookChartDensityBook();
    const statuses: ChartDepthStatus[] = [];
    const stop = connectHookChartDepth({ exchange, marketType: 'futures', symbol: 'BTC/USDT', origin: f.origin,
      createSocket: url => new NodeWebSocket(url) as unknown as WebSocket,
      onBook: update => book.apply(update),
      onStatus: status => { statuses.push(status); if (status !== 'live') book.clear(); },
    });
    t.after(stop);
    await until(() => f.sources.length === 1);
    f.sources[0].source.emit('depth', snapshot());
    await until(() => statuses.includes('live'));
    const settings = { densityMode: 'manual', densityThreshold: 100_000, densityDiffPct: 5 } as const;
    assert.equal(book.read(settings, 0).densities.length, 2);
    f.sources[0].source.emit('depth', { sequence: 101, eventTime: Date.now(), bids: [[99, 0]], asks: [] });
    await until(() => book.read(settings, 0).densities.length === 1);
    assert.equal(book.read(settings, 0).densities[0].side, 'ASK');
    f.sources[0].source.status = 'STALE'; f.sources[0].source.emit('status', 'STALE');
    await until(() => statuses.at(-1) === 'reconnecting');
    assert.equal(book.read(settings, 0).depthReady, false);
  });
}

class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {}
  close() { this.closed = true; this.onclose?.(); }
  emit(packet: ChartDepthPacket) { this.onmessage?.({ data: JSON.stringify(packet) }); }
}

for (const exchange of ['binance', 'bybit'] as const) {
  test(`${exchange}: exchange WebSocket frames reach the graph through the actual server adapter`, async t => {
    const exchangeHttp = createServer();
    const { WebSocketServer } = await import('ws');
    const exchangeWs = new WebSocketServer({ server: exchangeHttp });
    const peers: NodeWebSocket[] = [], subscriptions: any[] = [], requestedUrls: string[] = [];
    exchangeWs.on('connection', peer => {
      peers.push(peer);
      peer.on('message', message => subscriptions.push(JSON.parse(String(message))));
    });
    exchangeHttp.listen(0, '127.0.0.1'); await once(exchangeHttp, 'listening');
    const exchangeUrl = `ws://127.0.0.1:${(exchangeHttp.address() as AddressInfo).port}`;
    const app = createServer((_req, res) => { res.writeHead(404); res.end(); });
    let snapshotRequests = 0;
    const feed = installHookChartDepthStream(app, (symbol, ex, market) => new ExchangeStreamClient(symbol, ex, market, true, {
      createWebSocket: (url, options) => { requestedUrls.push(url); return new NodeWebSocket(exchangeUrl, options); },
      fetchBook: async () => { snapshotRequests++; return { symbol, exchange: ex, marketType: market,
        bids: snapshot().bids, asks: snapshot().asks, lastUpdateId: 100, timestamp: Date.now() }; },
    }));
    app.listen(0, '127.0.0.1'); await once(app, 'listening');
    const origin = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
    const book = new HookChartDensityBook(), statuses: ChartDepthStatus[] = [];
    const stop = connectHookChartDepth({ exchange, marketType: 'futures', symbol: 'BTCUSDT', origin,
      createSocket: url => new NodeWebSocket(url) as unknown as WebSocket,
      onBook: update => book.apply(update), onStatus: status => { statuses.push(status); if (status !== 'live') book.clear(); },
    });
    t.after(async () => {
      stop(); feed.close();
      for (const peer of exchangeWs.clients) peer.terminate();
      exchangeWs.close();
      await Promise.all([new Promise<void>(r => app.close(() => r())), new Promise<void>(r => exchangeHttp.close(() => r()))]);
    });
    await until(() => peers.length === 1 && (exchange === 'binance' ? snapshotRequests === 1 : subscriptions.length > 0));
    assert.equal(book.read({ densityMode: 'manual', densityThreshold: 100_000 }, 0).depthReady, false);
    if (exchange === 'binance') {
      assert.ok(requestedUrls[0].includes('/public/stream?streams=btcusdt@depth@100ms'));
      assert.equal(requestedUrls.length, 1, 'depth-only charts do not open a redundant trade socket');
      peers[0].send(JSON.stringify({ stream: 'btcusdt@depth@100ms', data: {
        e: 'depthUpdate', E: Date.now(), s: 'BTCUSDT', U: 99, u: 101, pu: 98, b: [], a: [],
      } }));
    } else {
      assert.deepEqual(subscriptions[0].args, ['orderbook.1000.BTCUSDT']);
      peers[0].send(JSON.stringify({ topic: 'orderbook.1000.BTCUSDT', type: 'snapshot', ts: Date.now(), data: {
        s: 'BTCUSDT', u: 100, seq: 100, b: snapshot().bids.map(row => row.map(String)), a: snapshot().asks.map(row => row.map(String)),
      } }));
    }
    await until(() => statuses.at(-1) === 'live');
    const settings = { densityMode: 'manual', densityThreshold: 100_000, densityDiffPct: 5 } as const;
    assert.equal(book.read(settings, 0).densities.length, 2);
    const cancel = exchange === 'binance'
      ? { stream: 'btcusdt@depth@100ms', data: { e: 'depthUpdate', E: Date.now(), s: 'BTCUSDT', U: 102, u: 103, pu: 101, b: [['99', '0']], a: [] } }
      : { topic: 'orderbook.1000.BTCUSDT', type: 'delta', ts: Date.now(), data: { s: 'BTCUSDT', u: 101, seq: 900, b: [['99', '0']], a: [] } };
    peers[0].send(JSON.stringify(cancel));
    await until(() => book.read(settings, 0).densities.length === 1);
    assert.equal(book.read(settings, 0).densities[0].side, 'ASK');
  });
}

function fakeClient(t: any) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 1_800_000_000_000 });
  const sockets: FakeSocket[] = [], statuses: ChartDepthStatus[] = [], updates: any[] = [];
  const stop = connectHookChartDepth({ exchange: 'binance', marketType: 'futures', symbol: 'BTC/USDT', origin: 'https://h00k.top',
    createSocket: url => { const socket = new FakeSocket(url); sockets.push(socket); return socket as unknown as WebSocket; },
    onBook: update => { updates.push(update); return true; }, onStatus: status => statuses.push(status),
  });
  t.after(stop);
  return { sockets, statuses, updates, stop };
}

test('browser clock offsets do not leave every valid exchange book waiting forever', t => {
  const f = fakeClient(t), socket = f.sockets[0], serverNow = Date.now() - 3_600_000;
  assert.equal(socket.url, 'wss://h00k.top/api/hookchart/depth?exchange=binance&market=futures&symbol=BTCUSDT');
  const scope = chartDepthScope('binance', 'futures', 'BTCUSDT');
  socket.emit({ scope, sampledAt: serverNow, status: 'CONNECTING' });
  socket.emit({ scope, sampledAt: serverNow, status: 'LIVE', update: { ...snapshot(), eventTime: serverNow - 100 } });
  assert.equal(f.statuses.at(-1), 'live');
  assert.equal(f.updates[0].eventTime, Date.now() - 100);
});

test('stale/buffered books are rejected even when a server and a browser have different clocks', t => {
  const f = fakeClient(t), socket = f.sockets[0], serverNow = Date.now() - 3_600_000;
  const scope = chartDepthScope('binance', 'futures', 'BTCUSDT');
  socket.emit({ scope, sampledAt: serverNow, status: 'CONNECTING' });
  socket.emit({ scope, sampledAt: serverNow, status: 'LIVE', update: { ...snapshot(), eventTime: serverNow - 10_000 } });
  assert.equal(f.updates.length, 0);
  assert.equal(f.statuses.at(-1), 'reconnecting');
  assert.equal(socket.closed, true);
});

test('silent connections reconnect and cleanup prevents a late retry after a chart closes', t => {
  const f = fakeClient(t);
  t.mock.timers.tick(16_000);
  assert.equal(f.sockets[0].closed, true);
  assert.equal(f.statuses.at(-1), 'reconnecting');
  t.mock.timers.tick(1000);
  assert.equal(f.sockets.length, 2);
  f.sockets[1].onerror?.();
  f.stop();
  t.mock.timers.tick(60_000);
  assert.equal(f.sockets.length, 2);
});

test('simultaneous HookCharts receive every identical depth frame without coalescing', async t => {
  const f = await fixture(t);
  const first = await f.open();
  const second = await f.open();
  await until(() => first.packets.length > 0 && second.packets.length > 0);
  assert.equal(f.sources.length, 1);

  f.sources[0].source.emit('depth', snapshot());
  await until(() => first.packets.some(p => p.update?.sequence === 100)
    && second.packets.some(p => p.update?.sequence === 100));
  const firstSnapshot = first.packets.find(p => p.update?.sequence === 100)!;
  const secondSnapshot = second.packets.find(p => p.update?.sequence === 100)!;
  assert.deepEqual(firstSnapshot, secondSnapshot, 'the same source frame must be delivered unchanged');

  f.sources[0].source.emit('depth', { sequence: 101, eventTime: Date.now(), bids: [[99, 0]], asks: [] });
  await until(() => first.packets.some(p => p.update?.sequence === 101)
    && second.packets.some(p => p.update?.sequence === 101));
  assert.deepEqual(first.packets.find(p => p.update?.sequence === 101),
    second.packets.find(p => p.update?.sequence === 101),
    'cancelled liquidity must reach both charts on the very next update');
  assert.equal(first.packets.filter(p => p.update).length, 2);
  assert.equal(second.packets.filter(p => p.update).length, 2);

  first.client.close(); second.client.close();
  await Promise.all([once(first.client, 'close'), once(second.client, 'close')]);
});


test('incremental server book keeps density levels on chart and in late subscriber snapshots', async t => {
  const f = await fixture(t);
  const first = await f.open();
  await until(() => f.sources.length === 1);
  const source = f.sources[0].source;
  const settings = { densityMode: 'manual', densityThreshold: 100_000, densityDiffPct: 5 } as const;
  const chart = new HookChartDensityBook();
  const firstSnapshot: BookUpdate = { isSnapshot: true, sequence: 200, eventTime: Date.now(),
    bids: [[99, 2000], [98, 2]], asks: [[101, 2000], [102, 2]] };
  const send = async (update: BookUpdate) => {
    source.emit('depth', update);
    await until(() => first.packets.some(p => p.update?.sequence === update.sequence));
    const delivered = first.packets.find(p => p.update?.sequence === update.sequence)!.update!;
    assert.deepEqual(delivered, update, 'full depth packets must reach the graph unchanged');
    assert.equal(chart.apply(delivered), true);
    return chart.read(settings, 0);
  };
  let view = await send(firstSnapshot);
  assert.deepEqual(view.densities.map(d => d.side).sort(), ['ASK', 'BID']);
  view = await send({ sequence: 201, eventTime: Date.now(), bids: [[98, 3]], asks: [[102, 3]] });
  assert.deepEqual(view.densities.map(d => d.side).sort(), ['ASK', 'BID']);
  await send({ sequence: 202, eventTime: Date.now(), bids: [[100, 2000]], asks: [[100.5, 2000]] });
  view = await send({ sequence: 203, eventTime: Date.now(),
    bids: [[100, 0], [99.5, 2000]], asks: [[100.5, 0], [100.75, 2000]] });
  assert.equal(source.resyncs, 0, 'valid replacements of best levels must stay LIVE');
  assert.ok(view.densities.some(d => d.side === 'BID' && d.p === 99.5 && d.usd === 199_000));
  assert.ok(view.densities.some(d => d.side === 'ASK' && d.p === 100.75 && d.usd === 201_500));

  const late = await f.open();
  await until(() => late.packets.some(p => p.update?.isSnapshot));
  const latePacket = late.packets.find(p => p.update?.isSnapshot)!.update!;
  assert.equal(latePacket.sequence, 203);
  assert.ok(latePacket.bids.some(([p, q]) => p === 99.5 && q === 2000));
  assert.ok(latePacket.asks.some(([p, q]) => p === 100.75 && q === 2000));
  assert.ok(!latePacket.bids.some(([p]) => p === 100));
  assert.ok(!latePacket.asks.some(([p]) => p === 100.5));
  const lateChart = new HookChartDensityBook();
  assert.equal(lateChart.apply(latePacket), true);
  assert.ok(lateChart.read(settings, 0).densities.some(d => d.p === 99.5));
  assert.ok(lateChart.read(settings, 0).densities.some(d => d.p === 100.75));

  source.emit('depth', { sequence: 204, eventTime: Date.now(), bids: [[102, 1]], asks: [] });
  await until(() => source.resyncs === 1);
  assert.ok(!first.packets.some(p => p.update?.sequence === 204), 'crossed book is never published');
  const recovered: BookUpdate = { isSnapshot: true, sequence: 300, eventTime: Date.now(),
    bids: [[49, 3000]], asks: [[51, 3000]] };
  source.emit('depth', recovered);
  await until(() => first.packets.some(p => p.update?.sequence === 300));
  const recoveryChart = new HookChartDensityBook();
  assert.equal(recoveryChart.apply(first.packets.find(p => p.update?.sequence === 300)!.update!), true);
  assert.deepEqual(recoveryChart.read(settings, 0).densities.map(d => d.side).sort(), ['ASK', 'BID']);
});

test('server no longer enumerates every best BID/ASK on ordinary deltas', () => {
  const source = readFileSync(new URL('../server/hookChartDepth.ts', import.meta.url), 'utf8');
  assert.match(source, /applyDepthSide\(current\.bids, bids, current\.bestBid, true\)/);
  assert.match(source, /applyDepthSide\(current\.asks, asks, current\.bestAsk, false\)/);
  assert.doesNotMatch(source, /Math\.max\(\.\.\.current\.bids\.keys\(\)\)/);
  assert.doesNotMatch(source, /Math\.min\(\.\.\.current\.asks\.keys\(\)\)/);
});
