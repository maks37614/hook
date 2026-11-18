import test from 'node:test';
import assert from 'node:assert/strict';
import { replayFallbackContainsDate, timeframeToMs } from '../src/utils/replayService';
import type { Kline } from '../src/types';

const candle=(time:number):Kline=>({
  time,open:100,high:101,low:99,close:100,volume:1,
});

test('Replay cannot misrepresent latest 2026 candles as a requested 2025 history',()=>{
  const latest=Date.UTC(2026,10,14,12)/1000;
  const candles=Array.from({length:500},(_,i)=>candle(latest-(499-i)*3600));
  const target=Date.UTC(2025,8,5,10);
  assert.equal(replayFallbackContainsDate(candles,target,'1h'),false);
  assert.equal(replayFallbackContainsDate(candles,Date.UTC(2026,10,8,12),'1h'),true);
  assert.equal(replayFallbackContainsDate(candles,(latest+3600)*1000,'1h'),false);
  assert.equal(replayFallbackContainsDate(candles,(latest+2*3600)*1000,'1h'),false);
  assert.equal(timeframeToMs('1h'),3_600_000);
});

test('fallback rejects invalid/empty or nonmatching candle ranges, handles millisecond candles',()=>{
  assert.equal(replayFallbackContainsDate([],Date.now(),'5m'),false);
  const a=Date.UTC(2026,10,10,10);
  assert.equal(replayFallbackContainsDate([candle(a),candle(a+60_000)],a,'1m'),true);
  assert.equal(replayFallbackContainsDate([candle(a),candle(a+60_000)],a-60_000,'1m'),false);
  assert.equal(replayFallbackContainsDate([candle(NaN)],a,'1h'),false);
  assert.equal(replayFallbackContainsDate([candle(a),candle(a+60_000)],Number.NaN,'1m'),false);
});
