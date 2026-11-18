import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';

type Packet = Parameters<OrderBookEngine['applyDepth']>[0];
const packet=(sequence:number,bids:unknown[],asks:unknown[],isSnapshot=false):Packet=>
  ({sequence,isSnapshot,eventTime:Date.now(),bids,asks}) as unknown as Packet;

test('string-valued WebSocket depth snapshots and deletions create a numeric live book',()=>{
  const book=new OrderBookEngine('BTCUSDT','bybit','futures');
  book.applyDepth(packet(1,[['100','5'],['99','2']],[['101','3']],true));
  assert.equal(book.getState().dataValid,true);
  assert.equal(book.getState().status,'LIVE');
  assert.equal(book.getState().bestBid,100);
  assert.equal(book.getState().bestAsk,101);
  assert.deepEqual(book.getSortedBids(2).map(level=>[level.price,level.quantity]),
    [[100,5],[99,2]]);
  book.applyDepth(packet(2,[['100','0'],['98','4']],[['101','5']]));
  assert.equal(book.getState().dataValid,true);
  assert.equal(book.getState().bestBid,99);
  assert.deepEqual(book.getSortedBids(2).map(level=>[level.price,level.quantity]),
    [[99,2],[98,4]]);
  assert.equal(book.getSortedAsks(1)[0].quantity,5);
});

test('mixed numeric/string levels are equivalent; malformed quantities still fail closed',()=>{
  const strings=new OrderBookEngine('ETHUSDT','binance','spot');
  const numbers=new OrderBookEngine('ETHUSDT','binance','spot');
  strings.applyDepth(packet(1,[['100','6']],[['101',2]],true));
  numbers.applyDepth(packet(1,[[100,6]],[[101,2]],true));
  assert.deepEqual(strings.getSortedBids(2),numbers.getSortedBids(2));
  assert.deepEqual(strings.getSortedAsks(2),numbers.getSortedAsks(2));
  strings.applyDepth(packet(2,[['100','Infinity']],[]));
  assert.equal(strings.getState().dataValid,false);
  assert.equal(strings.getState().status,'RESYNCING');
  // No incremental packet can silently promote a failed book to LIVE.
  strings.applyDepth(packet(3,[[100,3]],[]));
  assert.equal(strings.getState().dataValid,false);
  strings.applyDepth(packet(4,[[100,3]],[[101,2]],true));
  assert.equal(strings.getState().status,'LIVE');
});
