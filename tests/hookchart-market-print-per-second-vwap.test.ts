import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LargeMarketTradeTracker, subscribeMarketTrades, type MarketTrade,
} from '../src/components/hookchart/marketTradeStream';

const base = () => Math.floor(Date.now() / 1000) * 1000;
const trade = (id: string, t: number, p: number, q: number, side: MarketTrade['side'] = 'BUY'): MarketTrade =>
  ({ id, t, p, q, side });

function trackerWithLowCut(at: number) {
  const tracker = new LargeMarketTradeTracker();
  // Keep the cutoff below the synthetic trades so their entire notionals
  // qualify for each per-second print, regardless of later trade prices.
  tracker.seedThreshold([trade('seed-not-accepted', at - 100, 1, 1)]);
  assert.ok(tracker.thresholdUsd > 0 && tracker.thresholdUsd < 10);
  return tracker;
}

test('market prints use notional-weighted price of their OWN second, not the entire cross-second burst', () => {
  const start = base();
  const tracker = trackerWithLowCut(start);
  const first = trade('buy-a', start + 100, 100, 10); // $1000
  const second = trade('buy-b', start + 220, 200, 5); // $1000
  const third = trade('buy-c', start + 900, 50, 40); // $2000
  const nextSecond = trade('buy-d', start + 1060, 400, 5); // $2000

  tracker.accept(first);
  assert.equal(tracker.snapshot(start + 200)[0].p, 100);
  tracker.accept(second);
  assert.equal(tracker.snapshot(start + 250)[0].p, 150,
    'the already-accounted first trade must not be repriced with the entire burst average');
  tracker.accept(third);
  const previousSecondPrice = (100 * 1000 + 200 * 1000 + 50 * 2000) / 4000;
  assert.equal(tracker.snapshot(start + 950)[0].p, previousSecondPrice);

  tracker.accept(nextSecond);
  const prints = tracker.snapshot(start + 1200);
  assert.equal(prints.length, 2);
  assert.deepEqual(prints.map(p => p.t), [start, start + 1000]);
  assert.equal(prints[0].p, previousSecondPrice,
    'a later-second trade cannot change the earlier second\'s weighted price');
  assert.equal(prints[0].usd, 4000);
  assert.equal(prints[0].count, 3);
  assert.equal(prints[1].p, 400, 'the next-second bucket must only include its own trades');
  assert.equal(prints[1].usd, 2000);
  assert.equal(prints[1].count, 1);

  const revision = tracker.revision;
  assert.equal(tracker.accept(nextSecond), null, 'REST/WS overlap still deduplicates trade IDs');
  assert.equal(tracker.revision, revision);
  assert.deepEqual(tracker.snapshot(start + 1200), prints);
});

test('multiple bursts and opposing sides aggregate independently with exact per-second volume', () => {
  const start = base();
  const tracker = trackerWithLowCut(start);
  const rows = [
    trade('b1', start + 110, 100, 10),
    trade('b2', start + 130, 200, 10),
    trade('s1', start + 200, 300, 10, 'SELL'),
    trade('b3', start + 300, 50, 10),
    trade('s2', start + 330, 400, 10, 'SELL'),
  ];
  for (const row of rows) assert.ok(tracker.accept(row));
  const prints = tracker.snapshot(start + 400);
  assert.equal(prints.length, 2, 'one aggregated print per second and aggressor side');
  const buy = prints.find(item => item.side === 'BUY')!;
  const sell = prints.find(item => item.side === 'SELL')!;
  assert.equal(buy.count, 3);
  assert.equal(buy.usd, 3500);
  assert.ok(Math.abs(buy.p - (100 * 1000 + 200 * 2000 + 50 * 500) / 3500) < 1e-9);
  assert.equal(sell.count, 2);
  assert.equal(sell.usd, 7000);
  assert.ok(Math.abs(sell.p - (300 * 3000 + 400 * 4000) / 7000) < 1e-9);
  assert.equal(buy.t, start);
  assert.equal(sell.t, start);
});

test('hundreds of prints in one second preserve VWAP/volume/count without quadratic replay', () => {
  const start = base();
  const tracker = trackerWithLowCut(start);
  let expectedUsd = 0;
  let expectedPriceUsd = 0;
  for (let i = 0; i < 500; i++) {
    const p = 50 + (i % 17);
    const q = 3 + (i % 7);
    const usd = p * q;
    expectedUsd += usd;
    expectedPriceUsd += p * usd;
    assert.ok(tracker.accept(trade('bulk-' + i, start + 100 + i, p, q)));
  }
  const prints = tracker.snapshot(start + 800);
  assert.equal(prints.length, 1);
  assert.equal(prints[0].count, 500);
  assert.ok(Math.abs(prints[0].usd - expectedUsd) < 1e-7);
  assert.ok(Math.abs(prints[0].p - expectedPriceUsd / expectedUsd) < 1e-8);
});

class FakeSocket {
  static instances: FakeSocket[] = [];
  static readonly OPEN = 1;
  readyState = FakeSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((packet: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) { FakeSocket.instances.push(this); }
  close() { this.closed = true; this.readyState = 3; this.onclose?.(); }
  send(_payload: string) {}
  emit(id: number, time: number) {
    this.onmessage?.({ data: JSON.stringify({
      a: id, T: time, p: '100', q: '10', m: false,
    }) });
  }
}

test('50 charts of one symbol still share one WebSocket and one REST seed', async () => {
  const oldFetch = globalThis.fetch;
  const oldSocket = globalThis.WebSocket;
  const stop: Array<() => void> = [];
  FakeSocket.instances = [];
  let fetches = 0, deliveries = 0;
  try {
    globalThis.fetch = async () => { fetches++; return Response.json([]); };
    globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
    const scope = { exchange: 'binance' as const, marketType: 'futures' as const, symbol: 'SHAREDFIFTYUSDT' };
    for (let i = 0; i < 50; i++) stop.push(subscribeMarketTrades(scope, {
      onTrade: () => { deliveries++; }, onPrints: () => {},
    }));
    assert.equal(FakeSocket.instances.length, 1, 'one market feed per symbol, not one per chart');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(fetches, 1, 'all charts share a single initial REST seed');
    const ws = FakeSocket.instances[0];
    ws.emit(443001, base() + 100);
    assert.equal(deliveries, 50, 'one execution reaches each of the 50 chart listeners exactly once');
    for (const off of stop) off();
    assert.equal(ws.closed, false, 'quick remounts retain the shared socket for 1.5 seconds');
    await new Promise(resolve => setTimeout(resolve, 1_600));
    assert.equal(ws.closed, true, 'idle release eventually retires the one shared socket');
  } finally {
    for (const off of stop.reverse()) off();
    globalThis.fetch = oldFetch;
    globalThis.WebSocket = oldSocket;
  }
});
