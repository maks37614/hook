import assert from 'node:assert/strict';
import test from 'node:test';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';
import { densityOutlierThresholds, depthOutlierProfile } from '../server/surveillance/depthOutlierProfile';

type Level = [number, number];
type Market = { symbol: string; price: number; turnover: number };
/** Synthetic quote-volume fixtures, NOT assertions about current exchange
 * liquidity, listing status or a real market reaction. */
const markets: Market[] = [
  { symbol: 'ZECUSDT', price: 500, turnover: 10e6 },
  { symbol: 'SOXLUSDT', price: 45, turnover: 5e6 },
  { symbol: 'XAUUSDT', price: 4200, turnover: 12e6 },
  { symbol: 'USDCUSDT', price: 1, turnover: 100e6 },
  { symbol: 'SOLUSDT', price: 200, turnover: 3e9 },
  { symbol: 'SPCXUSDT', price: 250, turnover: 4e6 },
  { symbol: 'SNDKUSDT', price: 240, turnover: 4e6 },
  { symbol: 'XAGUSDT', price: 58, turnover: 8e6 },
  { symbol: 'EVVAUSDT', price: 10, turnover: 2e6 },
  { symbol: 'XRPUSDT', price: 3, turnover: 1e9 },
  { symbol: 'MUUSDT', price: 200, turnover: 10e6 },
  { symbol: 'ASTERUSDT', price: 1.5, turnover: 150e6 },
  { symbol: 'HYPEUSDT', price: 40, turnover: 1e9 },
  { symbol: 'BNBUSDT', price: 1000, turnover: 2e9 },
  { symbol: 'NVDAUSDT', price: 200, turnover: 10e6 },
  { symbol: 'BTCUSDT', price: 100_000, turnover: 40e9 },
  { symbol: 'ETHUSDT', price: 3_500, turnover: 8e9 },
  { symbol: 'BULLAUSDT', price: .015, turnover: 5e6 },
  { symbol: 'GOOGLUSDT', price: 300, turnover: 100e6 },
];
function makeBook(market: Market, fullCoverage = true) {
  const step = fullCoverage ? .00005 : .000008; // 5% or 0.8% max coverage for 1000 levels
  const bids: Level[] = [], asks: Level[] = [];
  for (let i = 1; i <= 1000; i++) {
    const bid = market.price * (1 - step * i);
    const ask = market.price * (1 + step * i);
    bids.push([bid, 1200 / bid]);
    asks.push([ask, 1200 / ask]);
  }
  const book = new OrderBookEngine(market.symbol, 'binance', 'futures');
  book.setVolume24hUsd(market.turnover);
  const now = Date.now();
  book.applyDepth({ isSnapshot: true, sequence: 1, eventTime: now, bids, asks });
  return { book, bids, asks };
}

test('AUTO market-size floor applies to every listed instrument by volume, not symbol, price or exchange guess', () => {
  let last = 0;
  for (const m of [...markets].sort((a,b) => a.turnover - b.turnover)) {
    const { book } = makeBook(m);
    const { bid, ask } = book.calculateDensityThresholds();
    assert.ok(bid >= last - 0.00001 && ask >= last - 0.00001, m.symbol);
    last = bid;
    assert.equal(bid, ask, m.symbol);
    const expectedFloor = Math.max(25_000, 30_000 * Math.pow(m.turnover / 10e6, .55));
    assert.ok(Math.abs(bid - expectedFloor) < 0.001, m.symbol);
    assert.deepEqual(book.getDensities(), [], m.symbol);
  }
  for (const symbol of ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT']) {
    const m = markets.find(x => x.symbol === symbol)!;
    assert.ok(makeBook(m).book.calculateAdaptiveThreshold() > 500_000,
      symbol + ': ordinary half-million-dollar book liquidity must not be pre-classified as unusual');
  }
});

test('a $50k wall two percent away is visible early on thin markets, and confirmed only after stable 15s', t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  for (const m of markets.filter(x => x.turnover <= 10e6)) {
    const { book, asks } = makeBook(m);
    const level = asks[399][0]; // 2.00% above the mid (subject to top-of-book spread)
    book.applyDepth({sequence:2,eventTime:now,bids:[],asks:[[level, 50_000 / level]]});
    const candidate = book.getDensities().find(d => d.side === 'ASK' && d.price === level);
    assert.ok(candidate, m.symbol + ': 50k should be a significant thin-market level at 2%');
    assert.ok(candidate.distancePct >= 1.9 && candidate.distancePct <= 2.1, m.symbol);
    assert.equal(candidate.ageSeconds, 0);
    assert.equal(candidate.confirmed, false, m.symbol);
    assert.deepEqual(book.pollNewlyAppearedDensities(), [],m.symbol);
    // Keep source fresh: a quiet 1000-level stream is only trusted for <=5s.
    for (let seq = 3; seq <= 6; seq++) {
      now += 4000;
      book.applyDepth({ sequence: seq, eventTime: now, bids: [], asks: [] });
      const d = book.getDensities().find(x => x.price === level);
      assert.ok(d, m.symbol);
      if (seq < 6) assert.equal(d.confirmed,false,m.symbol);
    }
    assert.equal(book.getDensities().find(d => d.price === level)?.confirmed,true,m.symbol);
    assert.equal(book.pollNewlyAppearedDensities().length,1,m.symbol);
    assert.deepEqual(book.pollNewlyAppearedDensities(),[],m.symbol);
  }
});

test('size instability delays AUTO alert even when the wall has existed for 15 seconds', t => {
  let now = Date.now();
  t.mock.method(Date,'now',()=>now);
  const {book,asks}=makeBook({symbol:'ZECUSDT',price:500,turnover:8e6});
  const price=asks[399][0];
  book.applyDepth({sequence:2,eventTime:now,bids:[],asks:[[price, 70_000/price]]});
  for(let seq=3; seq<=5; seq++){ now+=4000; book.applyDepth({sequence:seq,eventTime:now,bids:[],asks:[]}); }
  book.applyDepth({sequence:6,eventTime:now,bids:[],asks:[[price, 50_000/price]]});
  now+=4000;
  book.applyDepth({sequence:7,eventTime:now,bids:[],asks:[]});
  assert.equal(book.getDensities()[0].ageSeconds,16);
  assert.equal(book.getDensities()[0].confirmed,false);
  assert.deepEqual(book.pollNewlyAppearedDensities(),[]);
  now+=4000;
  book.applyDepth({sequence:8,eventTime:now,bids:[],asks:[]});
  assert.equal(book.getDensities()[0].confirmed,true);
  assert.equal(book.pollNewlyAppearedDensities().length,1);
});

test('farthest validated BID/ASK depth is reported, 3%-distant orders are not invented beyond it', () => {
  const full=makeBook({symbol:'XRPUSDT',price:3,turnover:10e6});
  const coverage=full.book.getState();
  assert.ok((coverage.bidCoveragePct||0)>3);
  assert.ok((coverage.askCoveragePct||0)>3);
  const shallow=makeBook({symbol:'XRPUSDT',price:3,turnover:10e6},false).book.getState();
  assert.ok((shallow.bidCoveragePct||0)<3);
  assert.ok((shallow.askCoveragePct||0)<3);
  assert.ok((shallow.bidCoveragePct||0)>0);
  assert.ok((shallow.askCoveragePct||0)>0);
});

test('rare wall is larger than same-side norms; a widespread identical size is not exceptional', () => {
  const m={symbol:'XAUUSDT',price:4000,turnover:5e6};
  const { book, bids, asks }=makeBook(m);
  const target=bids[249][0];
  book.applyDepth({sequence:2,bids:[[target,100_000/target]],asks:[],eventTime:Date.now()});
  assert.ok(book.getDensities().some(d=>d.side==='BID'&&d.price===target));
  const allBids=new Map(bids.map(([p])=>[p,100_000/p]));
  const profile=depthOutlierProfile(allBids,new Map(asks));
  assert.ok(profile);
  assert.ok(densityOutlierThresholds(profile,m.turnover,0,'AUTO').bid>100_000);
});
