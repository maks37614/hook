import test from 'node:test';
import assert from 'node:assert/strict';
import { connectHookChartLiquidations } from '../src/components/hookchart/liquidationStream';

class FakeLiquidationSocket {
  static instances: FakeLiquidationSocket[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  closeCount = 0;

  constructor(readonly url: string) { FakeLiquidationSocket.instances.push(this); }
  // Deliberately do NOT emit onclose: browsers sometimes leave half-open
  // sockets without a reliable close event.
  close() { this.closed = true; this.closeCount++; }
  emit(packet: object) { this.onmessage?.({ data: JSON.stringify(packet) }); }
}

function harness(t: any, overrides: {
  onSnapshot?: () => void;
  onStatus?: (connected: boolean) => void;
  onLiquidation?: () => void;
} = {}) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_800_000_000_000 });
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldSocket = globalThis.WebSocket;
  FakeLiquidationSocket.instances = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true, value: { location: { origin: 'https://h00k.top' } },
  });
  globalThis.WebSocket = FakeLiquidationSocket as unknown as typeof WebSocket;
  const statuses: boolean[] = [];
  const snapshots: unknown[][] = [];
  const events: unknown[] = [];
  const stop = connectHookChartLiquidations({
    exchange: 'binance', symbol: 'BTCUSDT',
    onSnapshot: (rows, connected) => {
      snapshots.push(rows);
      statuses.push(connected);
      overrides.onSnapshot?.();
    },
    onLiquidation: row => {
      events.push(row);
      overrides.onLiquidation?.();
    },
    onStatus: connected => {
      statuses.push(connected);
      overrides.onStatus?.(connected);
    },
  });
  t.after(() => {
    stop();
    globalThis.WebSocket = oldSocket;
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
    else delete (globalThis as any).window;
  });
  return { sockets: FakeLiquidationSocket.instances, statuses, snapshots, events, stop };
}

const snapshot = (connected = true) => ({
  type: 'snapshot', connected, events: [],
});

test('status-only traffic cannot hide missing initial liquidation snapshot forever', t => {
  const f = harness(t);
  const first = f.sockets[0];
  assert.match(first.url, /^wss:\/\/h00k\.top\/api\/hookchart\/liquidations\?/);
  assert.match(first.url, /exchange=binance/);
  assert.match(first.url, /symbol=BTCUSDT/);
  for (let i = 1; i <= 2; i++) {
    t.mock.timers.tick(5000);
    first.emit({ type: 'status', connected: true });
    assert.equal(first.closed, false);
  }
  first.emit({ type: 'unrelated' });
  t.mock.timers.tick(5000);
  assert.equal(first.closed, true, 'no valid snapshot after 15s retires the silent socket');
  assert.equal(first.closeCount, 1);
  assert.equal(f.statuses.at(-1), false);
  t.mock.timers.tick(1000);
  assert.equal(f.sockets.length, 2, 'one new socket opens after the bounded reconnect delay');
  first.onerror?.();
  first.onclose?.();
  assert.equal(f.sockets.length, 2, 'late callbacks from old sockets are ignored');
});

test('a real empty snapshot makes quiet liquidation markets healthy without spurious reconnects', t => {
  const f = harness(t);
  const first = f.sockets[0];
  first.emit(snapshot());
  assert.equal(f.snapshots.length, 1);
  assert.deepEqual(f.snapshots[0], []);
  t.mock.timers.tick(15 * 60_000);
  assert.equal(first.closed, false, 'no liquidations is normal for an illiquid instrument');
  assert.equal(f.sockets.length, 1);
  first.emit({ type: 'liquidation', event: {
    id: 'real-1', side: 'LONG', t: Date.now(), p: 100, q: 2, usd: 200,
  } });
  assert.equal(f.events.length, 1, 'valid liquidation events continue to reach charts');
});

test('onerror reconnects even when browser never delivers onclose; throwing callbacks cannot abort recovery', t => {
  const f = harness(t, {
    onStatus: () => { throw new Error('unmounted status listener'); },
    onLiquidation: () => { throw new Error('unmounted event listener'); },
  });
  const first = f.sockets[0];
  assert.equal(f.statuses.length, 1, 'a throwing initial callback cannot prevent subscription');
  first.emit(snapshot());
  first.emit({ type: 'liquidation', event: {
    id: 'valid-but-throwing', side: 'SHORT', t: Date.now(), p: 100, q: 1, usd: 100,
  } });
  assert.equal(f.events.length, 1);
  first.onerror?.();
  assert.equal(first.closed, true);
  assert.equal(f.statuses.at(-1), false);
  t.mock.timers.tick(1000);
  assert.equal(f.sockets.length, 2, 'error alone is enough to start a reconnect');
  first.onclose?.();
  assert.equal(f.sockets.length, 2);
});

test('rapid snapshot/close loops retain exponential retry backoff until a genuinely stable socket', t => {
  const f = harness(t);
  const a = f.sockets[0];
  a.emit(snapshot());
  a.onclose?.();
  t.mock.timers.tick(999);
  assert.equal(f.sockets.length, 1);
  t.mock.timers.tick(1);
  assert.equal(f.sockets.length, 2);

  const b = f.sockets[1];
  b.emit(snapshot());
  b.onclose?.();
  t.mock.timers.tick(1999);
  assert.equal(f.sockets.length, 2, 'brief success cannot reset retry budget');
  t.mock.timers.tick(1);
  assert.equal(f.sockets.length, 3);

  const c = f.sockets[2];
  c.emit(snapshot());
  t.mock.timers.tick(31_000);
  assert.equal(c.closed, false);
  c.onerror?.();
  t.mock.timers.tick(999);
  assert.equal(f.sockets.length, 3, 'long-lived healthy connection resets next retry delay');
  t.mock.timers.tick(1);
  assert.equal(f.sockets.length, 4);
});

test('unsubscribing clears initial deadline, pending retries and ignores late socket events', t => {
  const f = harness(t);
  const first = f.sockets[0];
  f.stop();
  assert.equal(first.closed, true);
  t.mock.timers.tick(120_000);
  assert.equal(f.sockets.length, 1);
  first.onerror?.();
  first.onclose?.();
  t.mock.timers.tick(120_000);
  assert.equal(f.sockets.length, 1, 'no ghost socket after final unmount');
});
