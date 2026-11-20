import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { completedMinuteStart, readOneMinuteTurnover, chooseMinuteCandidates, MinuteTurnoverService } from '../server/minuteTurnoverService';
import { getCachedCompletedMinuteQuoteVolume } from '../server/marketService';
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

test('footer minute readings reuse chart-priority Kline fetches instead of bypassing verified chart cache', () => {
  const service = readFileSync(new URL('../server/minuteTurnoverService.ts', import.meta.url), 'utf8');
  const market = readFileSync(new URL('../server/marketService.ts', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  assert.match(service, /fetchKlines\(exchange, market, symbol, '1m', 10, undefined, undefined, \{ chart: true \}\)/);
  assert.doesNotMatch(service, /fetchKlines\(exchange, market, symbol, '1m', 10, undefined, undefined, \{\s*requireFresh:true\s*\}\)/);
  assert.match(market, /const marketRequest = options\.chart \? chartExchangeFetch : exchangeFetch;/);
  assert.match(market, /if \(!options\.requireFresh && cached/);
  assert.match(server, /minuteTurnoverService\.publicCoin\(/);
  const now = Date.UTC(2026, 10, 20, 20, 10, 35);
  const target = completedMinuteStart(now);
  const recent = [
    { time:(target - 60_000)/1000, quoteVolume: 12345, open:1, high:1, low:1, close:1, volume:1 },
    { time:target/1000, quoteVolume: 456789, open:1, high:1, low:1, close:1, volume:1 },
  ];
  assert.deepEqual(readOneMinuteTurnover(recent, target), { minuteStart:target, volume1mUsd:456789 });
  assert.equal(readOneMinuteTurnover(recent, target+60_000).volume1mUsd, null,
    'older cached candle must never appear as a newer minute');
});

test('AV reads a completed 1m candle already cached for a different chart history limit', () => {
  const candleMinute = completedMinuteStart(minute + 65_000);
  const sample = { time:candleMinute/1000,quoteVolume:88_759.602153,
    open:0.0062,high:0.00625,low:0.006,close:0.0061,volume:123 };
  const cachedAt = candleMinute + 60_010;
  const rows = new Map([
    ['binance:futures:AKEUSDT:1m:500::', {data:[sample],timestamp:cachedAt,requestedAt:cachedAt}],
    ['binance:futures:OTHERUSDT:1m:10::', {data:[sample],timestamp:cachedAt,requestedAt:cachedAt}],
    ['bybit:futures:AKEUSDT:1m:500::', {data:[{...sample,quoteVolume:30_000}],timestamp:cachedAt,requestedAt:cachedAt}],
  ]);
  assert.equal(getCachedCompletedMinuteQuoteVolume('binance','futures','AKEUSDT',candleMinute,rows),88_759.602153);
  assert.equal(getCachedCompletedMinuteQuoteVolume('bybit','futures','AKEUSDT',candleMinute,rows),30_000);
  assert.equal(getCachedCompletedMinuteQuoteVolume('binance','spot','AKEUSDT',candleMinute,rows),null);
  assert.equal(getCachedCompletedMinuteQuoteVolume('binance','futures','AKEUSDT',candleMinute+60_000,rows),null,
    'cache contains no volume from the next minute');
  const premature = new Map([
    ['binance:futures:AKEUSDT:1m:500::',
      {data:[sample], timestamp:cachedAt,requestedAt:candleMinute+55_000}],
  ]);
  assert.equal(getCachedCompletedMinuteQuoteVolume('binance','futures','AKEUSDT',candleMinute,premature),null,
    'partial still-forming minute must not be accepted as final turnover');
  const badValue = new Map([
    ['binance:futures:AKEUSDT:1m:500::',
      {data:[{...sample,quoteVolume:Number.NaN}],timestamp:cachedAt,requestedAt:cachedAt}],
  ]);
  assert.equal(getCachedCompletedMinuteQuoteVolume('binance','futures','AKEUSDT',candleMinute,badValue),null);
  assert.equal(getCachedCompletedMinuteQuoteVolume('binance','futures','AKEUSDT',candleMinute + 123,rows),null);
});

test('loaded Terminal chart shows AKE minute turnover even after all 48 public REST symbol slots are occupied', async () => {
  const now = minute + 65_000, target = completedMinuteStart(now);
  const alreadyCached = new Map<string,number>();
  let exchangeRequests = 0;
  const service = new MinuteTurnoverService(async () => {
    exchangeRequests++;
    return [{time:target/1000,quoteVolume:200_000,open:1,high:1,low:1,close:1,volume:1}];
  },async () => [],() => now,
  (exchange,market,symbol,minuteStart) => minuteStart===target
    ? alreadyCached.get([exchange,market,symbol].join(':')) ?? null : null);
  // A different chart opens AKE after 48 distinct per-minute public lookups.
  for(let i=0;i<48;i++)
    assert.equal((await service.publicCoin('binance','futures','P'+i+'USDT')).volume1mUsd,200_000);
  assert.equal(exchangeRequests,48);
  assert.equal((await service.publicCoin('binance','futures','AKEUSDT')).volume1mUsd,null);
  // Chart history is requested in the same server, at a different limit (500).
  alreadyCached.set('binance:futures:AKEUSDT',88_759.602153);
  assert.deepEqual(await service.publicCoin('binance','futures','AKEUSDT'),
    {minuteStart:target,volume1mUsd:88_759.602153});
  assert.equal(exchangeRequests,48,'read from shared chart cache without an extra REST request');
  assert.deepEqual(await service.coin('binance','futures','AKEUSDT'),
    {minuteStart:target,volume1mUsd:88_759.602153});
  assert.equal(exchangeRequests,48);
});

test('a failed minute REST read is upgraded when the regular HookChart cache fills later', async () => {
  const now=minute+65_000, target=completedMinuteStart(now);
  let chartCached:number|null=null;
  let calls=0;
  const service=new MinuteTurnoverService(async()=>{
    calls++;
    return [];
  },async()=>[],()=>now,()=>chartCached);
  assert.equal((await service.coin('binance','futures','AKEUSDT')).volume1mUsd,null);
  chartCached=88_759.602153;
  assert.equal((await service.coin('binance','futures','AKEUSDT')).volume1mUsd,88_759.602153);
  assert.equal(calls,1,'a previous null cannot mask newly available shared chart candles');
});
