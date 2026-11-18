import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';

test('empty depth heartbeats keep sequence/freshness without scanning the whole DOM each tick', t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const book = new OrderBookEngine('HEARTBEATUSDT', 'bybit', 'futures');
  book.applyDepth({isSnapshot:true,sequence:1,eventTime:now,
    bids:[[100,100],[99,20]],asks:[[101,15],[102,20]]});
  const initial = book.thresholdStats();
  assert.equal(initial.densityEvaluations, 1);
  assert.equal(initial.medianComputations, 1);

  for(let sequence=2;sequence<=302;sequence++) {
    now += 10;
    book.applyDepth({sequence,eventTime:now,bids:[],asks:[]});
    assert.equal(book.getState().status,'LIVE');
  }
  const after = book.thresholdStats();
  assert.equal(book.getState().sequence,302);
  assert.equal(book.getState().lastReceivedAt,now);
  assert.equal(after.bookRevision,initial.bookRevision,
    'empty packets cannot invalidate sorted book or median cache');
  assert.equal(after.medianComputations,initial.medianComputations);
  assert.ok(after.densityEvaluations <= 5,
    '300 empty packets over 3 seconds should require at most 4 DOM passes');
  assert.ok(after.densityEvaluations >= 3,
    'density aging must still happen at least every second');
});

test('time-driven wall persistence and once-only density alerts survive no-op budget', t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const book = new OrderBookEngine('PERSISTUSDT', 'binance', 'futures',{
    mode:'MANUAL', manualThresholdUsd:1_000, minPersistenceSeconds:15,
    minDistancePct:0.1,
  });
  book.applyDepth({isSnapshot:true,sequence:1,eventTime:now,
    bids:[[100,5]],asks:[[101,2]]});
  assert.deepEqual(book.pollNewlyAppearedDensities(),[],
    'an initial snapshot is not a new arrival');
  book.applyDepth({sequence:2,eventTime:now,bids:[[100,30]],asks:[]});
  assert.equal(book.pollNewlyAppearedDensities().length,1);
  for(let sequence=3;sequence<=27;sequence++){
    now += 750;
    book.applyDepth({sequence,eventTime:now,bids:[],asks:[]});
  }
  const density=book.getDensities().find(item=>item.side==='BID');
  assert.ok(density);
  assert.equal(density!.classification,'PERSISTENT_LIQUIDITY');
  assert.ok(density!.ageSeconds>=15);
  assert.deepEqual(book.pollNewlyAppearedDensities(),[],
    'empty heartbeats must not create repeated appeared-density alerts');
  assert.equal(book.getState().status,'LIVE');
});

test('personal turnover changes force immediate density re-evaluation even on an empty packet',t=>{
  let now = Date.now();
  t.mock.method(Date,'now',()=>now);
  const book=new OrderBookEngine('VOLUMEUSDT','bybit','futures');
  book.setVolume24hUsd(1_000_000);
  const bids: [number,number][] = [[100,1000], ...Array.from({length:35},(_,i) => {
    const p=99-i*0.01; return [p,1000/p] as [number,number];
  })];
  const asks: [number,number][] = Array.from({length:36},(_,i) => {
    const p=101+i*0.01; return [p,1000/p] as [number,number];
  });
  book.applyDepth({isSnapshot:true,sequence:1,eventTime:now,bids,asks});
  assert.equal(book.getDensities().length,1);
  const before=book.thresholdStats().densityEvaluations;
  book.setVolume24hUsd(5_000_000_000);
  now+=10;
  book.applyDepth({sequence:2,eventTime:now,bids:[],asks:[]});
  assert.ok(book.thresholdStats().densityEvaluations>before);
  assert.deepEqual(book.getDensities(),[],
    'new AUTO threshold must remove no-longer-significant liquidity');
  book.setVolume24hUsd(1_000_000);
  now+=10;
  book.applyDepth({sequence:3,eventTime:now,bids:[],asks:[]});
  assert.equal(book.getDensities().length,1,
    'a verified lower turnover restores an outstanding wall');
  book.clear();
  assert.equal(book.getState().dataValid,false);
});
