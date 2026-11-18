import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRegularOIHistory, getRegularOIRequest,
  parseBinanceOIHistory, parseBybitOIHistory,
  requestRegularOI, verifyOIHistory, REGULAR_OI_REASON_UK,
} from '../src/utils/regularOIHistory';

const PERIOD = 300_000;
const now = () => Date.now();
function snapshots(t: number) {
  return [
    { timestamp: t - 3 * PERIOD, sumOpenInterest: '100', sumOpenInterestValue: '10000' },
    { timestamp: t - 2 * PERIOD, sumOpenInterest: '101', sumOpenInterestValue: '15000' },
    { timestamp: t - PERIOD, sumOpenInterest: '102', sumOpenInterestValue: '20000' },
  ];
}
function bybit(points: ReturnType<typeof snapshots>) {
  return { retCode: 0, result: {
    list: [...points].reverse().map(r => ({
      timestamp: String(r.timestamp), openInterest: r.sumOpenInterest,
    })),
  } };
}
const jsonResponse = (x: unknown, status = 200) =>
  new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json' } });

test('regular OI URLs are exchange-correct, future-only and reject 1m without network access', () => {
  const binance = getRegularOIRequest('binance', 'futures', 'BTCUSDT', '5m');
  const bybitUrl = getRegularOIRequest('bybit', 'futures', 'BTCUSDT', '15m');
  assert.ok('url' in binance && binance.url.includes('/futures/data/openInterestHist'));
  assert.ok('url' in binance && binance.url.includes('period=5m') && binance.url.includes('limit=8'));
  assert.ok('url' in bybitUrl && bybitUrl.url.includes('intervalTime=15min'));
  assert.deepEqual(getRegularOIRequest('binance','spot','BTCUSDT','5m'),
    { snapshot: null, reason: 'spot' });
  assert.deepEqual(getRegularOIRequest('binance','futures','BTCUSDT','1m'),
    { snapshot: null, reason: 'unsupported-timeframe' });
  assert.deepEqual(getRegularOIRequest('bybit','futures','BAD/USDT','5m'),
    { snapshot: null, reason: 'invalid-symbol' });
});

test('shared OI parser handles Binance oldest-first and Bybit newest-first and does not use USD variation', () => {
  const epoch = Math.floor(now() / PERIOD) * PERIOD;
  const bins = snapshots(epoch);
  const b = evaluateRegularOIHistory('binance', bins, PERIOD, now());
  const y = evaluateRegularOIHistory('bybit', bybit(bins), PERIOD, now());
  assert.equal(b.reason, 'available');
  assert.equal(y.reason, 'available');
  assert.equal(b.snapshot?.changePct, 0.99);
  assert.equal(y.snapshot?.changePct, 0.99);
  assert.equal(b.snapshot?.timestamp, bins[2].timestamp);
  assert.equal(b.snapshot?.usd, 20_000);
  const alteredUSD = bins.map((r,i) => ({ ...r, sumOpenInterestValue: String((i+1)*300_000) }));
  assert.equal(evaluateRegularOIHistory('binance', alteredUSD, PERIOD, now()).snapshot?.changePct, .99);
  assert.equal(parseBinanceOIHistory(bins).length, 3);
  assert.equal(parseBybitOIHistory(bybit(bins)).length, 3);
});

test('eight-record responses choose the latest three, not the oldest three or provider order', () => {
  const epoch = Math.floor(now() / PERIOD) * PERIOD;
  const points = Array.from({ length: 8 }, (_,i) => ({
    timestamp: epoch - (8-i)*PERIOD,
    sumOpenInterest: String(100+i), sumOpenInterestValue: String(50_000+i*10),
  }));
  assert.equal(evaluateRegularOIHistory('binance', points, PERIOD, now()).snapshot?.amount, 107);
  assert.equal(evaluateRegularOIHistory('bybit', bybit(points), PERIOD, now()).snapshot?.amount, 107);
});

test('missing, stale, duplicate, malformed or gapped history NEVER produces fake OI', () => {
  const epoch = Math.floor(now() / PERIOD) * PERIOD;
  // Use a stable point inside the 5m bucket. With wall-clock now(), the
  // duplicated-record fixture becomes stale after 90s and hides the gap error.
  const referenceNow = epoch + 30_000;
  const base = snapshots(epoch);
  const tests = [
    { input: base.slice(0, 2), reason: 'incomplete-history' },
    { input: [base[0], base[1], { ...base[2], timestamp: base[1].timestamp }], reason: 'history-gap' },
    { input: [base[0], base[1], { ...base[2], timestamp: base[2].timestamp + PERIOD }], reason: 'history-gap' },
    { input: [base[0], base[1], { ...base[2], sumOpenInterest: '-1' }], reason: 'invalid-response' },
    { input: base.map(x => ({...x, timestamp: x.timestamp - 6*PERIOD})), reason: 'stale-history' },
  ];
  for (const t of tests) {
    const got = evaluateRegularOIHistory('binance', t.input, PERIOD, referenceNow);
    assert.equal(got.reason, t.reason);
    assert.equal(got.snapshot, null);
  }
  assert.equal(evaluateRegularOIHistory('bybit', { retCode: 10001, result: { list: [] } },
    PERIOD, referenceNow).reason, 'invalid-response');
  assert.equal(verifyOIHistory(parseBinanceOIHistory(base).slice(1), PERIOD, referenceNow)?.changePct, 0.99);
});

test('shared network reader handles both server and browser requests with injected fetch, without changing market geometry', async () => {
  const epoch = Math.floor(now() / PERIOD)*PERIOD;
  const payload = snapshots(epoch);
  const seen: string[] = [];
  const mockFetch: typeof fetch = async (input) => {
    seen.push(String(input));
    return jsonResponse(payload);
  };
  const direct = await requestRegularOI('binance','futures','ETHUSDT','5m',mockFetch);
  assert.equal(direct.reason, 'available');
  assert.equal(direct.snapshot?.changePct, 0.99);
  assert.equal(seen.length, 1);
  assert.match(seen[0], /ETHUSDT/);
  const notForSpot = await requestRegularOI('binance','spot','ETHUSDT','5m',mockFetch);
  const notForMinute = await requestRegularOI('binance','futures','ETHUSDT','1m',mockFetch);
  assert.equal(notForSpot.reason, 'spot');
  assert.equal(notForMinute.reason, 'unsupported-timeframe');
  assert.equal(seen.length, 1, 'unsupported scans must not generate any OI requests');
});

test('browser failures, rate limits, bad JSON and API errors distinguish reasons from measured 0%', async () => {
  const statuses: Array<[typeof fetch, string]> = [
    [async () => jsonResponse({}, 429), 'rate-limited'],
    [async () => jsonResponse({}, 403), 'http-error'],
    [async () => { throw new TypeError('Failed to fetch'); }, 'network-error'],
    [async () => jsonResponse({ code: -1121, msg: 'Bad symbol' }), 'invalid-response'],
  ];
  for (const [fetcher, reason] of statuses) {
    const result = await requestRegularOI('binance','futures','BTCUSDT','5m',fetcher);
    assert.equal(result.reason, reason);
    assert.equal(result.snapshot, null);
    assert.ok(REGULAR_OI_REASON_UK[result.reason].length > 10);
  }
});
