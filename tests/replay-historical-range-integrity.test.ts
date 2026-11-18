import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchHistoricalReplayCandles, replayFallbackContainsDate } from '../src/utils/replayService';
import type { Kline } from '../src/types';

const kline = (time: number): Kline => ({
  time, open: 100, high: 101, low: 99, close: 100, volume: 10,
});
const binanceBar = (time: number) => [
  time, '100', '101', '99', '100', '10', time + 3599999,
  '1000', 10, '5', '500', '0',
];

test('historical range check rejects gaps even if the requested date is between first/last candle', () => {
  const earlier=Date.UTC(2025,7,5,10)/1000;
  const later=Date.UTC(2025,7,7,10)/1000;
  assert.equal(replayFallbackContainsDate([kline(earlier),kline(later)],
    Date.UTC(2025,7,6,10),'1h'),false);
  assert.equal(replayFallbackContainsDate([kline(earlier),kline(later)],
    earlier*1000,'1h'),true);
  assert.equal(replayFallbackContainsDate([kline(earlier),kline(later)],
    (earlier+3600)*1000,'1h'),false);
});

test('Replay falls through an unrelated server response to historical direct exchange data', async t => {
  const target=Date.UTC(2025,5,20,12);
  const wrong=Array.from({length:50},(_,i)=>kline(Date.UTC(2026,10,13,i%24)/1000+i*86400));
  const good=Array.from({length:41},(_,i)=>binanceBar(target+(i-20)*3600000));
  const calls:string[]=[];
  t.mock.method(globalThis,'fetch',async (input:RequestInfo|URL) => {
    const url=String(input);calls.push(url);
    if(url.startsWith('/api/klines?'))
      return Response.json({success:true,data:wrong});
    if(url.includes('fapi.binance.com'))
      return Response.json(good);
    throw new Error('unexpected request '+url);
  });
  const result=await fetchHistoricalReplayCandles(
    'binance','futures','REPLAYVALIDATIONTESTUSDT','1h',target,20,20);
  assert.equal(result.allCandles.length,41);
  assert.equal(result.allCandles[result.cutoffIndex].time,target/1000);
  assert.equal(calls.length,2,'only one server request and one direct fallback');
});

test('Replay returns no candles if all sources supply the wrong date, never invents a cutoff',async t => {
  const target=Date.UTC(2025,3,12,12);
  const recent=Array.from({length:50},(_,i)=>binanceBar(Date.UTC(2026,10,10)+i*3600000));
  const wrong=recent.map(bar=>kline(Number(bar[0])/1000));
  const calls:string[]=[];
  t.mock.method(globalThis,'fetch',async (input:RequestInfo|URL) => {
    const url=String(input);calls.push(url);
    if(url.startsWith('/api/klines?'))return Response.json({success:true,data:wrong});
    return Response.json(recent);
  });
  const result=await fetchHistoricalReplayCandles(
    'binance','futures','REPLAYBADDATEUSDT','1h',target,20,20);
  assert.deepEqual(result,{allCandles:[],cutoffIndex:0});
  assert.equal(calls.length,3,
    'bounded path checks server, historical direct and latest fallback once each');
});
