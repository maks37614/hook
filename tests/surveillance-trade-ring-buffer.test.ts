import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TradeRingBuffer } from '../server/surveillance/tradeRingBuffer';

test('5000-trade ring retains newest arrivals in exact chronological order', () => {
  const ring=new TradeRingBuffer<number>(5000);
  for(let i=0;i<13_500;i++) ring.push(i);
  assert.equal(ring.length,5000);
  const trades=ring.drain();
  assert.equal(trades.length,5000);
  assert.equal(trades[0],8500);
  assert.equal(trades[trades.length-1],13_499);
  for(let i=1;i<trades.length;i++) assert.equal(trades[i],trades[i-1]+1);
  assert.equal(ring.length,0);
});

test('drain, reuse and clear preserve FIFO semantics', () => {
  const ring=new TradeRingBuffer<string>(3);
  ring.push('a'); ring.push('b');
  assert.deepEqual(ring.drain(),['a','b']);
  ring.push('c'); ring.push('d'); ring.push('e');
  assert.deepEqual(ring.drain(),['c','d','e']);
  ring.push('f'); ring.push('g'); ring.push('h'); ring.push('i');
  assert.deepEqual(ring.drain(),['g','h','i']);
  ring.push('j'); ring.clear(); ring.push('k');
  assert.deepEqual(ring.drain(),['k']);
});

test('shared candle feed buffers trades without shifting, preserves closed-candle replay checks', () => {
  const source=readFileSync(new URL('../server/surveillance/sharedCandleFeed.ts',import.meta.url),'utf8');
  assert.match(source,/pending:new TradeRingBuffer<RawTradeEvent>\(5000\)/);
  assert.match(source,/entry\.pending\.drain\(\)/);
  assert.match(source,/trade\.time >= lastSnapshotBucket/);
  assert.doesNotMatch(source,/pending\.shift\(\)/);
  assert.match(source,/created\.tradeWindow\.addTrade\(trade\)/);
});
