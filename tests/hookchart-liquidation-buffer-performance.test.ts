import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LiquidationEventBuffer } from '../src/components/hookchart/liquidationEventBuffer';

type Row = { id: string; t: number; usd: number; side: 'LONG' | 'SHORT' };
const row = (id: string, t: number, usd: number, side: 'LONG' | 'SHORT' = 'LONG'): Row =>
  ({ id, t, usd, side });

test('liquidation buffer indexes cumulative fills by exact order ID', () => {
  const book = new LiquidationEventBuffer<Row>();
  const t = Date.now();
  assert.equal(book.upsert(row('a', t, 100)), true);
  assert.equal(book.upsert(row('a', t, 100)), false);
  assert.equal(book.upsert(row('a', t, 50)), false);
  assert.equal(book.upsert(row('a', t, 200)), true);
  assert.equal(book.upsert(row('b', t + 10, 300, 'SHORT')), true);
  assert.equal(book.size, 2);
  assert.deepEqual(book.snapshot(t + 10), [row('a', t, 200), row('b', t + 10, 300, 'SHORT')]);
  assert.equal(book.newestEventTime(), t + 10);
});

test('five thousand liquidation fills keep only the latest 1500 events and true amounts', () => {
  const book = new LiquidationEventBuffer<Row>();
  const t = Date.now();
  for (let i = 0; i < 5000; i++) {
    assert.equal(book.upsert(row('order-' + i, t - 5000 + i, i + 1,
      i % 2 ? 'SHORT' : 'LONG')), true);
  }
  const recent = book.snapshot(t);
  assert.equal(recent.length, 1500);
  assert.equal(book.size, 1500);
  assert.equal(recent[0].id, 'order-3500');
  assert.equal(recent.at(-1)?.id, 'order-4999');
  assert.equal(recent.reduce((total, event) => total + event.usd, 0),
    1500 * (3501 + 5000) / 2);
  assert.equal(book.upsert(row('order-4999', t, 6000)), true);
  assert.equal(book.snapshot(t).at(-1)?.usd, 6000);
});

test('buffer removes expired rows and sorts out-of-order reconnect snapshots', () => {
  const book = new LiquidationEventBuffer<Row>();
  const t = Date.now(), expired = t - 31 * 60_000;
  book.replace([
    row('second', t - 1000, 100),
    row('old', expired, 200),
    row('first', t - 2000, 50),
    row('first', t - 2000, 30),
    row('first', t - 2000, 70),
  ]);
  assert.deepEqual(book.snapshot(t).map(event => [event.id, event.usd]),
    [['first', 70], ['second', 100]]);
  assert.equal(book.size, 2);
  book.replace([]);
  assert.deepEqual(book.snapshot(t), []);
});

test('all live HookCharts use one indexed Liq buffer per market, while Replay stays isolated', () => {
  const hook = readFileSync(new URL('../src/components/hookchart/useOriginalHookChartLiveFeed.ts', import.meta.url), 'utf8');
  const shared = readFileSync(new URL('../src/components/hookchart/sharedLiquidationView.ts', import.meta.url), 'utf8');
  assert.match(shared, /new LiquidationEventBuffer<Liquidation>\(\)/);
  assert.match(shared, /current\.buffered\.upsert\(row\)/);
  assert.match(shared, /current\.buffered\.replace\(deduplicateLiquidations\(events\)\)/);
  assert.match(shared, /entry\.buffered\.snapshot\(now\)/);
  assert.match(hook, /sharedLiquidationViews\.subscribe\(/);
  assert.doesNotMatch(hook, /new LiquidationEventBuffer<Liquidation>\(\)/);
  assert.match(hook, /if \(replay \|\| lightweight \|\| !exchangeSymbol \|\| marketType !== 'futures'\)/);
});
