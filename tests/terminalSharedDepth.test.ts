import assert from 'node:assert/strict';
import test from 'node:test';
import type { BookUpdate } from '../src/utils/binanceOrderBook';
import { createSharedDepthSubscriptions } from '../src/components/hookchart/sharedDepthStream';
import { isBridgeableDepthScope } from '../src/utils/desktopDepthBridge';
import type { ChartDepthStatus } from '../src/utils/hookChartDepthProtocol';

const scope = { exchange: 'binance' as const, marketType: 'futures' as const, symbol: 'BTCUSDT' };

test('depth fanout has one upstream and a late chart gets snapshot before LIVE', () => {
  let connects = 0;
  let stops = 0;
  const source: { current?: {
    onBook: (update: BookUpdate) => boolean;
    onStatus: (status: ChartDepthStatus) => void;
  } } = {};
  const manager = createSharedDepthSubscriptions(options => {
    connects++;
    source.current = options;
    return () => { stops++; };
  });
  const firstEvents: string[] = [];
  const secondEvents: string[] = [];
  const unsubscribeFirst = manager.subscribe({
    ...scope,
    onBook: update => { firstEvents.push(update.isSnapshot ? 'snapshot' : 'delta'); return true; },
    onStatus: status => { firstEvents.push(status); },
  });
  const initial: BookUpdate = {
    sequence: 100, eventTime: Date.now(), isSnapshot: true,
    bids: [[100, 3], [99, 4]], asks: [[101, 5], [102, 6]],
  };
  assert.equal(source.current?.onBook(initial), true);
  source.current?.onStatus('live');
  const unsubscribeSecond = manager.subscribe({
    ...scope,
    onBook: update => { secondEvents.push(update.isSnapshot ? 'snapshot' : 'delta'); return true; },
    onStatus: status => { secondEvents.push(status); },
  });
  assert.equal(connects, 1);
  assert.deepEqual(secondEvents, ['snapshot', 'live']);
  assert.equal(manager.activeScopes(), 1);

  const delta: BookUpdate = {
    sequence: 101, eventTime: Date.now(), bids: [[100, 4]], asks: [[102, 8]],
  };
  assert.equal(source.current?.onBook(delta), true);
  assert.deepEqual(firstEvents.slice(-1), ['delta']);
  assert.deepEqual(secondEvents.slice(-1), ['delta']);
  unsubscribeFirst();
  assert.equal(stops, 0);
  unsubscribeSecond();
  assert.equal(stops, 1);
  assert.equal(manager.activeScopes(), 0);
});

test('broken listener is isolated and does not prevent fresh snapshots', () => {
  const handler: { current?: (packet: BookUpdate) => boolean } = {};
  const manager = createSharedDepthSubscriptions(options => {
    handler.current = options.onBook;
    return () => {};
  });
  let goodPackets = 0;
  const badStatuses: ChartDepthStatus[] = [];
  const bad = manager.subscribe({
    ...scope,
    onBook: () => false,
    onStatus: status => { badStatuses.push(status); },
  });
  const good = manager.subscribe({
    ...scope,
    onBook: () => { goodPackets++; return true; },
    onStatus: () => {},
  });
  assert.equal(handler.current?.({
    sequence: 1, isSnapshot: true, eventTime: Date.now(),
    bids: [[100, 1]], asks: [[101, 1]],
  }), true);
  assert.ok(goodPackets > 0);
  assert.equal(badStatuses.at(-1), 'reconnecting');
  bad(); good();
});

test('cross-window order-book scopes accept Unicode symbols without mixing markets', () => {
  assert.equal(isBridgeableDepthScope({
    exchange: 'binance', marketType: 'futures', symbol: '龙虾USDT',
  }), true);
  assert.equal(isBridgeableDepthScope({
    exchange: 'binance', marketType: 'spot', symbol: 'BTC/USDT',
  }), true);
  assert.equal(isBridgeableDepthScope({
    exchange: 'bybit', marketType: 'futures', symbol: 'BTCUSDT',
  }), true);
  assert.equal(isBridgeableDepthScope({
    exchange: 'binance', marketType: 'futures', symbol: '../',
  }), false);
  assert.equal(isBridgeableDepthScope({
    exchange: 'binance', marketType: 'futures', symbol: 'BTCUSDT',
  }, 75, false), false);
  assert.equal(isBridgeableDepthScope({
    exchange: 'binance', marketType: 'futures', symbol: 'BTCUSDT',
  }, 75, true), true);
});

test('normal browser pages may use the existing fail-open cross-window depth bridge', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/components/hookchart/sharedDepthStream.ts', import.meta.url), 'utf8');
  assert.match(source, /\/\^https\?:\$\/\.test\(window\.location\.protocol\)/);
  assert.match(source, /navigator\.locks\?\.request/);
  assert.match(source, /return defaultDepthManager\.subscribe\(options\)/);
  assert.match(source, /createDesktopDepthBridge/);
});
