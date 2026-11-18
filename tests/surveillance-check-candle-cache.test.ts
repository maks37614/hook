import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SurveillanceCheckCandleCache } from '../server/surveillance/checkCandleCache';
import type { Kline } from '../src/types';

const candle=(time:number,close:number):Kline=>({time,open:close,high:close,low:close,close,volume:5});

test('one exchange request is shared across simultaneous user checks', async () => {
  let now=70_000, calls=0, resolve!: (rows:Kline[])=>void;
  const cache=new SurveillanceCheckCandleCache(
    async () => { calls++; return new Promise<Kline[]>(r=>{resolve=r;}); },
    ()=>now, 18_000, 3,
  );
  const a=cache.get('binance','futures','BTCUSDT','15m',60);
  const b=cache.get('binance','futures','BTCUSDT','15m',60);
  assert.equal(calls,1);
  resolve([candle(60_000,101)]);
  assert.deepEqual(await a,await b);
  assert.deepEqual(await cache.get('binance','futures','BTCUSDT','15m',60),[candle(60_000,101)]);
  assert.equal(cache.stats().hits,1);
  assert.equal(cache.stats().shared,1);
});

test('cache expires at candle close, not merely after TTL; independent markets never mix', async () => {
  let now=899_000, calls=0;
  const cache=new SurveillanceCheckCandleCache(async()=>[candle(now,++calls)],()=>now,18_000,8);
  const before=await cache.get('binance','futures','BTCUSDT','15m',60);
  now=899_500;
  assert.equal((await cache.get('binance','futures','BTCUSDT','15m',60))[0].close,before[0].close);
  now=900_000; // exact 15m boundary
  assert.notEqual((await cache.get('binance','futures','BTCUSDT','15m',60))[0].close,before[0].close);
  await cache.get('bybit','futures','BTCUSDT','15m',60);
  await cache.get('binance','spot','BTCUSDT','15m',60);
  await cache.get('binance','futures','ETHUSDT','15m',60);
  assert.equal(calls,5);
});

test('empty candles never become a fresh cached signal; entries stay bounded', async () => {
  let calls=0;
  const cache=new SurveillanceCheckCandleCache(async()=>{calls++; return calls===1 ? [] : [candle(5000,calls)];},
    ()=>20_000,18_000,1);
  assert.deepEqual(await cache.get('binance','futures','BTCUSDT','1h',60),[]);
  assert.equal(cache.stats().entries,0);
  assert.ok((await cache.get('binance','futures','BTCUSDT','1h',60)).length);
  await cache.get('binance','futures','ETHUSDT','1h',60);
  assert.equal(cache.stats().entries,1);
});

test('surveillance monitor coalesces REST checks and skips overlapping passes', () => {
  const source=readFileSync(new URL('../server/surveillanceService.ts',import.meta.url),'utf8');
  assert.match(source,/surveillanceCheckCandleCache\.get\(coin\.exchange, coin\.marketType, coin\.symbol, tf,/);
  assert.match(source,/if \(monitorPassInFlight\) return;/);
  assert.match(source,/monitorPassInFlight = true;/);
  assert.match(source,/finally \{[\s\S]*?monitorPassInFlight = false;/);
});

test('a request that crosses candle close is never cached as the new closed candle', async () => {
  let now=899_900, calls=0;
  const pending: Array<(rows:Kline[])=>void> = [];
  const cache=new SurveillanceCheckCandleCache(async () => {
    calls++;
    return new Promise<Kline[]>(resolve => pending.push(resolve));
  },()=>now,18_000,8);
  const old=cache.get('binance','futures','BTCUSDT','15m',60);
  now=900_100; // first request is still in flight at the next 15m candle
  const current=cache.get('binance','futures','BTCUSDT','15m',60);
  assert.equal(calls,2,'a new bar must not join the older in-flight request');
  pending[1]([candle(900_000,202)]);
  assert.equal((await current)[0].close,202);
  pending[0]([candle(899_000,101)]);
  assert.equal((await old)[0].close,101);
  assert.equal((await cache.get('binance','futures','BTCUSDT','15m',60))[0].close,202);
  assert.equal(calls,2,'an older request must not overwrite the next candle');
});

test('each surveillance user receives a private copy of cached OHLCV', async () => {
  let now=120_000, calls=0;
  const cache=new SurveillanceCheckCandleCache(async()=>{calls++;return [candle(0,300)]},
    ()=>now,18_000,8);
  const first=await cache.get('bybit','spot','ETHUSDT','1h',60);
  first[0].close=999;
  const second=await cache.get('bybit','spot','ETHUSDT','1h',60);
  assert.equal(second[0].close,300);
  assert.notStrictEqual(first,second);
  assert.notStrictEqual(first[0],second[0]);
  assert.equal(calls,1);
});
