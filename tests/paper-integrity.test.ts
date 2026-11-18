import test from 'node:test';
import assert from 'node:assert/strict';
import { runScreenerScan } from '../server/marketService';
import { readRegularFormationCandles } from '../src/utils/regularFormationCandles';
import { runDirectClientScan } from '../src/utils/directExchangeClient';
import { finalizeFormationGeometry, detectFormations } from '../src/utils/patternRecognition';
import type { DetectedFormation, Kline } from '../src/types';

const now = 1_793_000_040_000; // Fixed minute boundary; no exchange/network dependency.
const rows = (end: number, count = 70): Kline[] => Array.from({ length: count }, (_, i) => ({
  time: end / 1000 - (count - i) * 60, open: 100, high: 101, low: 99, close: 100, volume: 10,
}));

test('formation provenance rejects stale, future, gapped and malformed real-source inputs', () => {
  const data = rows(now);
  assert.deepEqual(readRegularFormationCandles(data, '1m', now, now)?.provenance, { collectedAt: now, lastClosedAt: now, contiguous: true });
  assert.equal(readRegularFormationCandles(data, '1m', now - 181_000, now), null);
  assert.equal(readRegularFormationCandles(data, '1m', now + 1, now), null);
  assert.equal(readRegularFormationCandles(data.filter((_, i) => i !== 35), '1m', now, now), null);
  for (const invalid of [{ high: 90 }, { close: NaN }, { volume: -1 }, { time: data[35].time + 1 }]) {
    assert.equal(readRegularFormationCandles(data.map((c, i) => i === 35 ? { ...c, ...invalid } : c), '1m', now, now), null);
  }
  assert.equal(readRegularFormationCandles(rows(now - 180_000), '1m', now, now), null, 'new HTTP collection cannot make old market candles fresh');
});

test('a candle fetched before its close never becomes final merely because wall clock advances', () => {
  const data = [...rows(now), { time: now / 1000, open: 100, high: 900, low: 1, close: 500, volume: 10 }];
  const provenance = readRegularFormationCandles(data, '1m', now + 30_000, now + 90_000);
  assert.equal(provenance?.provenance.lastClosedAt, now, 'the later incomplete candle remains excluded');
  const acrossClose = readRegularFormationCandles(data, '1m', now + 61_000, now + 61_000, now + 59_000);
  assert.equal(acrossClose?.provenance.lastClosedAt, now, 'an HTTP response crossing the candle boundary cannot confirm the in-flight bar');
});

test('a cache snapshot that was fresh at request time can become too old at scan time', () => {
  const data = rows(now);
  const requestedAt = now + 145_000;
  assert.ok(readRegularFormationCandles(data, '1m', requestedAt, requestedAt, requestedAt));
  assert.equal(readRegularFormationCandles(data, '1m', requestedAt + 2_000, now + 151_000, requestedAt), null);
});

test('browser fallback rejects a cached candle window once it becomes stale', async () => {
  const previousFetch = globalThis.fetch;
  const previousNow = Date.now;
  let clock = now + 149_000;
  let candleFails = false;
  Date.now = () => clock;
  globalThis.fetch = async input => {
    if (String(input).includes('/tickers?')) return Response.json({ retCode: 0, result: { list: [{
      symbol: 'BROWSERSTALEUSDT', lastPrice: '100', turnover24h: '10000000',
    }] } });
    if (!String(input).includes('/kline?') || candleFails) return new Response('', { status: 503 });
    return Response.json({ retCode: 0, result: { list: rows(now).reverse()
      .map(c => [c.time * 1000, c.open, c.high, c.low, c.close, c.volume]) } });
  };
  try {
    const params = { exchange: 'bybit', marketType: 'spot', timeframe: '1m' } as const;
    const options = { allowStaticFallback: false };
    const first = await runDirectClientScan(params, options);
    assert.equal(first.length, 1);
    assert.equal(first[0].formationData?.lastClosedAt, now);
    clock += 2_000;
    candleFails = true;
    assert.deepEqual(await runDirectClientScan(params, options), []);
  } finally {
    globalThis.fetch = previousFetch;
    Date.now = previousNow;
  }
});

test('an exchange candle failure cannot produce a freshly stamped formation from the old cache', async () => {
  const previousFetch = globalThis.fetch; const previousNow = Date.now;
  let clock=now; let candleFails=false;
  Date.now = () => clock;
  globalThis.fetch = async input => {
    if (String(input).includes('tickers')) return Response.json({ retCode:0,result:{list:[{
      symbol:'PROVENANCEUSDT',lastPrice:'100',price24hPcnt:'0',turnover24h:'10000000',highPrice24h:'110',lowPrice24h:'90',
    }]}});
    if (candleFails) return new Response('',{status:503});
    return Response.json({retCode:0,result:{list:rows(now).reverse().map(c=>[c.time*1000,c.open,c.high,c.low,c.close,c.volume])}});
  };
  try {
    const params={exchange:'bybit' as const,marketType:'spot' as const,timeframe:'1m' as const};
    const first=await runScreenerScan(params);
    assert.equal(first.length,1); assert.equal(first[0].formationData?.collectedAt,now);
    clock+=181_000; candleFails=true;
    assert.deepEqual(await runScreenerScan(params),[], 'fresh tickers cannot conceal unavailable final candles');
  } finally { globalThis.fetch=previousFetch; Date.now=previousNow; }
});

test('geometry preserves measured levels without manufactured stops, targets or minimum R:R', () => {
  const base: DetectedFormation = {
    id: 'measured', patternKey: 'double_bottom', name: 'W', nameEn: 'W', category: 'reversal', bias: 'bullish',
    confidence: 80, status: 'breakout', statusLabel: '', description: '', detectedAt: now,
    levels: { entryPrice: 100, stopLossPrice: 98, targetPrice: 100.01 },
    potentialProfitPct: 0, potentialRiskPct: 0, riskRewardRatio: 0,
  };
  for (const bias of ['bullish', 'bearish', 'neutral'] as const) {
    const raw = { ...base, bias, levels: { entryPrice: 100, stopLossPrice: 0, targetPrice: 0 } };
    const result = finalizeFormationGeometry(raw, 100);
    assert.deepEqual(result.levels, { ...raw.levels, supportPrice: undefined, resistancePrice: undefined, necklinePrice: undefined });
    assert.equal(result.riskRewardRatio, 0);
  }
  assert.equal(finalizeFormationGeometry(base, 100).riskRewardRatio, .01, 'a tiny measured reward is not floored to .5R');
  const closeToTarget = finalizeFormationGeometry({ ...base, levels: { entryPrice: 100, stopLossPrice: 98, targetPrice: 106 } }, 105.9);
  assert.equal(closeToTarget.status, 'breakout', 'being near a target is not an actual target touch');
});

test('minute formation identities retain their actual timeframe', () => {
  const end = Math.floor(Date.now() / 60_000) * 60;
  const data = Array.from({ length: 70 }, (_, i) => {
    const price = 100 + Math.sin(i / 3) * 4;
    return { time: end - (70 - i) * 60, open: price, high: price + 1, low: price - 1, close: price + .1, volume: 100 };
  });
  const found = detectFormations(data, 'AUDITUSDT');
  assert.ok(found.length > 0, 'fixture must exercise an actual detected formation');
  for (const formation of found) assert.match(formation.id, /-1m-/, formation.id);
});

