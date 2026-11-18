import test from 'node:test';
import assert from 'node:assert/strict';
import { connectHookChartDepth } from '../src/components/hookchart/depthStream';
import { chartDepthScope, type ChartDepthPacket, type ChartDepthStatus } from '../src/utils/hookChartDepthProtocol';

class FakeDepthSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {}
  close() {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }
  emit(packet: ChartDepthPacket) {
    this.onmessage?.({ data: JSON.stringify(packet) });
  }
}

const scope = chartDepthScope('binance', 'futures', 'BTCUSDT');
const packet = (status: ChartDepthPacket['status'], update?: ChartDepthPacket['update']): ChartDepthPacket => ({
  scope, sampledAt: Date.now(), status, ...(update ? { update } : {}),
});

function createHarness(t: any) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 1_800_000_000_000 });
  const sockets: FakeDepthSocket[] = [];
  const statuses: ChartDepthStatus[] = [];
  const books: ChartDepthPacket['update'][] = [];
  const stop = connectHookChartDepth({
    exchange: 'binance', marketType: 'futures', symbol: 'BTCUSDT', origin: 'https://h00k.top',
    createSocket: url => {
      const socket = new FakeDepthSocket(url);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    onBook: update => { books.push(update); return true; },
    onStatus: status => statuses.push(status),
  });
  t.after(stop);
  return { sockets, statuses, books, stop };
}

test('status-only LIVE/SYNCING heartbeats cannot indefinitely hide a missing first depth snapshot', t => {
  const f = createHarness(t);
  const socket = f.sockets[0];
  assert.equal(f.sockets.length, 1);
  for (let i = 1; i <= 15; i++) {
    t.mock.timers.tick(1000);
    socket.emit(packet(i % 2 ? 'SYNCING' : 'LIVE'));
    assert.equal(socket.closed, false, 'the first snapshot still has its 15s synchronization budget');
  }
  assert.equal(f.books.length, 0);
  t.mock.timers.tick(1000);
  assert.equal(socket.closed, true, 'continuous status traffic must not suppress the depth watchdog');
  assert.equal(f.statuses.at(-1), 'reconnecting');
  t.mock.timers.tick(1000);
  assert.equal(f.sockets.length, 2, 'a replacement socket is opened after the usual reconnect delay');
  f.stop();
  t.mock.timers.tick(60_000);
  assert.equal(f.sockets.length, 2, 'unmount must prevent further reconnects');
});

test('a fresh depth snapshot retains normal 5-second freshness protection', t => {
  const f = createHarness(t);
  const socket = f.sockets[0];
  socket.emit(packet('LIVE', {
    isSnapshot: true, sequence: 200, eventTime: Date.now(),
    bids: [[99, 5]], asks: [[101, 7]],
  }));
  assert.equal(f.statuses.at(-1), 'live');
  t.mock.timers.tick(4000);
  assert.equal(socket.closed, false);
  socket.emit(packet('LIVE', { sequence: 201, eventTime: Date.now(), bids: [[99, 6]], asks: [] }));
  t.mock.timers.tick(4000);
  assert.equal(socket.closed, false, 'a newer valid delta renews the live depth freshness window');
  t.mock.timers.tick(2000);
  assert.equal(socket.closed, true, 'a live book that stops updating still needs resynchronization');
  assert.equal(f.statuses.at(-1), 'reconnecting');
});

test('resynchronizing after a valid book starts a fresh 15s wait not measured from original socket open', t => {
  const f = createHarness(t);
  const socket = f.sockets[0];
  socket.emit(packet('LIVE', {
    isSnapshot: true, sequence: 300, eventTime: Date.now(),
    bids: [[99, 5]], asks: [[101, 7]],
  }));
  t.mock.timers.tick(4000);
  socket.emit(packet('SYNCING'));
  assert.equal(f.statuses.at(-1), 'syncing');

  for (let i = 1; i <= 15; i++) {
    t.mock.timers.tick(1000);
    socket.emit(packet(i % 2 ? 'RESYNCING' : 'SYNCING'));
    assert.equal(socket.closed, false,
      'repeated resync statuses must not shorten or extend the 15s recovery budget');
  }
  t.mock.timers.tick(1000);
  assert.equal(socket.closed, true,
    'a resync that never produces another complete book must reconnect, even with status heartbeats');
  assert.equal(f.statuses.at(-1), 'reconnecting');
});
