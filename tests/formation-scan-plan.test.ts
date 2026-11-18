import test from 'node:test';
import assert from 'node:assert/strict';
import { formationScanPlan, FORMATION_TIMEFRAMES } from '../server/formationScanPlan';
import { runBackgroundFormationScans, runScreenerScan, getSharedScreenerJobStats, isReusableScreenerScanSnapshot } from '../server/marketService';

test('all six TFs share 75 checks, with no multiplied coin budget', () => {
  const plan = formationScanPlan({ HOOK_SCREENER_TIMEFRAMES: FORMATION_TIMEFRAMES.join(',') });
  assert.deepEqual(plan.timeframes, FORMATION_TIMEFRAMES);
  assert.deepEqual(plan.allocations.map(row => row.maxCandidates), [13, 13, 13, 12, 12, 12]);
  assert.equal(plan.allocations.reduce((sum, row) => sum + row.maxCandidates, 0), 75);
  assert.equal(formationScanPlan({ HOOK_SCREENER_TIMEFRAMES: '1m,1m, 1h ' }).allocations.reduce((sum, row) => sum + row.maxCandidates, 0), 75);
  assert.deepEqual(formationScanPlan({ HOOK_SCREENER_TIMEFRAMES: '1m,1m, 1h ' }).timeframes, ['1m', '1h']);
});

test('legacy single-TF configuration is preserved; invalid plural configuration is explicit', () => {
  assert.deepEqual(formationScanPlan({}).allocations, [{ timeframe: '1h', maxCandidates: 75 }]);
  assert.deepEqual(formationScanPlan({ HOOK_SCREENER_TIMEFRAME: '1m' }).timeframes, ['1m']);
  assert.deepEqual(formationScanPlan({ HOOK_SCREENER_TIMEFRAME: 'bad' }).timeframes, ['1h']);
  assert.deepEqual(formationScanPlan({ HOOK_SCREENER_TIMEFRAME: '1m', HOOK_SCREENER_TIMEFRAMES: '5m,1d' }).timeframes, ['5m', '1d']);
  for (const raw of ['', '1m,', '2m', '1m,2m', '__proto__']) {
    assert.throws(() => formationScanPlan({ HOOK_SCREENER_TIMEFRAMES: raw }), /HOOK_SCREENER_TIMEFRAMES/);
  }
});

test('one background cycle shares tickers and warms every TF with 75 bounded candidate checks', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = process.env.HOOK_SCREENER_TIMEFRAMES;
  process.env.HOOK_SCREENER_TIMEFRAMES = FORMATION_TIMEFRAMES.join(',');
  let tickerRequests = 0;
  let candleRequests = 0;
  let depthRequests = 0;
  let active = 0;
  let maxActive = 0;
  const perTf: Record<string, number> = {};
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.includes('ticker/24hr')) {
      tickerRequests++;
      return Response.json(Array.from({ length: 100 }, (_, i) => ({
        symbol: `COIN${i}USDT`, lastPrice: '100', priceChangePercent: '1',
        quoteVolume: String(10_000_000 - i * 1000), highPrice: '150', lowPrice: '50',
      })));
    }
    if (url.pathname.includes('/market/tickers')) {
      tickerRequests++;
      // A valid, below-threshold snapshot exercises the shared cache without
      // introducing another candidate. Empty API lists trigger mirror fallback.
      return Response.json({ retCode: 0, result: { list: [
        { symbol: 'DUMMYUSDT', lastPrice: '100', price24hPcnt: '0',
          turnover24h: '1', highPrice24h: '101', lowPrice24h: '99' },
      ] } });
    }
    if (url.pathname.endsWith('/depth')) {
      depthRequests++;
      return Response.json({ bids: [], asks: [] });
    }
    assert.match(url.pathname, /klines$/);
    candleRequests++;
    const timeframe = url.searchParams.get('interval')!;
    perTf[timeframe] = (perTf[timeframe] || 0) + 1;
    const seconds = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 }[timeframe]!;
    assert.ok(seconds);
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 0));
    active--;
    const end = Math.floor(Date.now() / (seconds * 1000)) * seconds;
    return Response.json(Array.from({ length: 70 }, (_, i) => {
      const open = 100 + i * 0.005;
      return [(end - (70 - i) * seconds) * 1000, String(open), String(open + .08), String(open - .08), String(open + .003), '1000'];
    }));
  };
  try {
    await runBackgroundFormationScans();
    assert.equal(tickerRequests, 2, 'one real snapshot for each existing futures ticker source');
    assert.equal(candleRequests, 75);
    assert.deepEqual(perTf, { '1m': 13, '5m': 13, '15m': 13, '1h': 12, '4h': 12, '1d': 12 });
    assert.ok(maxActive <= 25, `existing concurrency ceiling preserved: ${maxActive}`);
    assert.ok(depthRequests <= 75, 'at most one density lookup per candidate, as before');
    // No separate bot export or market-data polling is used to warm the core scan cache.

    // Foreground callers retain their original 75-candidate behavior.
    const params = { exchange: 'all' as const, marketType: 'futures' as const,
      timeframe: '1m' as const, minVolumeUsd: 100_000 };
    const full = await runScreenerScan(params);
    assert.equal(full.length, 75, 'a smaller background cache does not truncate the foreground scanner');
    const beforeCachedJobCount = getSharedScreenerJobStats().uniqueJobs;
    const warmCall = runScreenerScan(params);
    assert.equal(getSharedScreenerJobStats().uniqueJobs, beforeCachedJobCount,
      'a valid result must never enter the bounded heavy scan queue');
    assert.equal(await warmCall, full, 'a cache hit returns the exact existing immutable snapshot');
    const beforeWarm = candleRequests + tickerRequests + depthRequests;
    await runBackgroundFormationScans();
    assert.equal(candleRequests + tickerRequests + depthRequests, beforeWarm, 'a fresh populated cache is reused by the worker');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalConfig === undefined) delete process.env.HOOK_SCREENER_TIMEFRAMES;
    else process.env.HOOK_SCREENER_TIMEFRAMES = originalConfig;
  }
});

test('scan snapshots are reusable only within TTL and for a sufficient candidate budget', () => {
  const now = 1_000_000;
  const entry = { timestamp: now - 44_999, candidateLimit: 75 };
  assert.equal(isReusableScreenerScanSnapshot(entry, 75, now), true);
  assert.equal(isReusableScreenerScanSnapshot(entry, 25, now), true);
  assert.equal(isReusableScreenerScanSnapshot(entry, 76, now), false,
    'a smaller background snapshot cannot satisfy more candidates');
  assert.equal(isReusableScreenerScanSnapshot({ ...entry, timestamp: now - 45_000 }, 75, now), false);
  assert.equal(isReusableScreenerScanSnapshot({ ...entry, timestamp: now + 1 }, 75, now), false);
  assert.equal(isReusableScreenerScanSnapshot(undefined, 75, now), false);
});
