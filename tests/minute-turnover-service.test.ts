import test from 'node:test';
import assert from 'node:assert/strict';
import { completedMinuteStart, readOneMinuteTurnover, chooseMinuteCandidates, MinuteTurnoverService } from '../server/minuteTurnoverService';
import type { RawTicker } from '../server/marketTickerFeed';

const minute=1_700_000_040_000;
const quote=(symbol:string,volumeUsd:number,change24h=1):RawTicker=>({symbol,volumeUsd,change24h,
  baseAsset:symbol.replace('USDT',''),quoteAsset:'USDT',exchange:'binance',marketType:'futures',
  price:10,high24h:11,low24h:9});
test('AV uses the last completed minute only; no 24h/1440 fallback',()=>{
  const candles=[{time:minute/1000-60,quoteVolume:310_000},{time:minute/1000,quoteVolume:8_000_000}]
    .map(x=>({...x,open:1,high:2,low:1,close:2,volume:1}));
  assert.deepEqual(readOneMinuteTurnover(candles,minute-60_000), {minuteStart:minute-60_000,volume1mUsd:310_000});
  assert.deepEqual(readOneMinuteTurnover(candles,minute+60_000), {minuteStart:minute+60_000,volume1mUsd:null});
  assert.equal(completedMinuteStart(minute+61_000),minute-60_000);
  assert.equal(completedMinuteStart(minute+65_000),minute);
});
test('candidate selection is bounded, uses varied market sources, and does not mutate quotes',()=>{
  const list=Array.from({length:100},(_,i)=>quote('C'+i+'USDT',1_000_000+i*100_000,i===3?300:1));
  const copy=[...list];
  const selected=chooseMinuteCandidates(list);
  assert.equal(selected.length,24);
  assert.ok(selected.some(x=>x.symbol==='C3USDT'));
  assert.deepEqual(list,copy);
});
test('one-minute service ranks 200K+ true candle volumes, shares identical requests and excludes missing',async()=>{
  const now=minute+65_000;
  const target=completedMinuteStart(now);
  const calls=new Map<string,number>();
  const service=new MinuteTurnoverService(async (_e,_m,s)=>{
    calls.set(s,(calls.get(s)||0)+1);
    const usd=s==='C0USDT'?190_000:s==='C1USDT'?320_000:s==='C2USDT'?230_000:0;
    return [{time:target/1000,quoteVolume:usd,open:1,high:1,low:1,close:1,volume:1}];
  },async (exchange,market)=>exchange==='binance'&&market==='futures'
    ? [quote('C0USDT',40_000_000),quote('C1USDT',9_000_000),quote('C2USDT',7_000_000)]:[],()=>now);
  const [a,b]=await Promise.all([service.top(),service.top()]);
  assert.strictEqual(a,b);
  assert.deepEqual(a.rows.map(x=>x.symbol),['C1USDT','C2USDT']);
  assert.equal(a.sampled,3);
  assert.equal(a.universe,3);
  assert.equal(calls.get('C1USDT'),1);
  assert.equal((await service.coin('binance','futures','C1USDT')).volume1mUsd,320_000);
  assert.equal(calls.get('C1USDT'),1);
});

test('public per-symbol footer reads are bounded and cannot exhaust shared IP budget',async()=>{
  const now=minute+65_000, target=completedMinuteStart(now);
  let calls=0;
  const svc=new MinuteTurnoverService(async()=>{
    calls++;
    return [{time:target/1000,quoteVolume:300_000,open:1,high:1,low:1,close:1,volume:1}];
  },async()=>[],()=>now);
  for(let i=0;i<48;i++){
    const value=await svc.publicCoin('binance','spot','P'+i+'USDT');
    assert.equal(value.volume1mUsd,300_000);
  }
  assert.equal((await svc.publicCoin('binance','spot','P48USDT')).volume1mUsd,null);
  assert.equal(calls,48);
  assert.equal((await svc.publicCoin('binance','spot','P0USDT')).volume1mUsd,300_000);
  assert.equal(calls,48);
});
