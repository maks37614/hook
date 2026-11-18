import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSharedFundingSubscriptions, fetchHookChartFunding,
  type FundingPacket, type FundingSnapshot,
} from '../src/components/hookchart/sharedFundingStream';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('historical Funding HTTP failure does not hide a successfully fetched Binance rate', async () => {
  const original = globalThis.fetch;
  const requests: string[] = [];
  try {
    globalThis.fetch = async url => {
      const href = String(url);
      requests.push(href);
      if (href.includes('/fapi/v1/fundingRate?')) throw new Error('funding-history HTTP 429');
      if (href.includes('/fapi/v1/premiumIndex?'))
        return Response.json({ lastFundingRate: '0.00025', nextFundingTime: 2_000_000_100_000 });
      throw new Error('unexpected endpoint');
    };
    const packet = await fetchHookChartFunding('binance', 'HISTFAILBINUSDT', true);
    assert.equal(packet.rate, .00025);
    assert.equal(packet.history, undefined, 'unavailable history must not masquerade as a valid empty list');
    assert.equal(requests.length, 2);
  } finally { globalThis.fetch = original; }
});

test('Bybit history retCode failure does not erase good current rate', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async url => {
      const href = String(url);
      if (href.includes('/v5/market/tickers?'))
        return Response.json({ retCode: 0, result: { list: [{ fundingRate: '-0.00036', nextFundingTime: 2_000_000_100_000 }] } });
      if (href.includes('/v5/market/funding/history?'))
        return Response.json({ retCode: 10006, retMsg: 'rate limit', result: { list: [] } });
      throw new Error('unexpected endpoint');
    };
    const packet = await fetchHookChartFunding('bybit', 'HISTFAILBYBUSDT', true);
    assert.equal(packet.rate, -.00036);
    assert.equal(packet.history, undefined, 'a failed Bybit history response cannot be treated as an empty successful history');
  } finally { globalThis.fetch = original; }
});

test('failed history is retried at the next tick while the current funding rate remains live', async () => {
  let now = 2_000_000_000_000;
  let tick: () => void = () => {};
  const requested: boolean[] = [];
  const snapshots: FundingSnapshot[] = [];
  let attempt = 0;
  const shared = createSharedFundingSubscriptions(
    async (_exchange, _symbol, refreshHistory): Promise<FundingPacket> => {
      requested.push(refreshHistory);
      attempt++;
      if (attempt === 1) return { rate: .0001, history: undefined, nextFundingAt: now + 60_000 };
      if (attempt === 2) return { rate: .0002, history: [.00005, .00007] };
      return { rate: .0002 };
    },
    {
      now: () => now,
      every: fn => { tick = fn; return 1; },
      cancel: () => {},
    },
  );
  const off = shared.subscribe('binance', 'FUNDRETRYUSDT', row => snapshots.push(row));
  await flush();
  assert.deepEqual(requested, [true]);
  assert.equal(snapshots.at(-1)?.rate, .0001);
  assert.deepEqual(snapshots.at(-1)?.history, []);

  now += 60_000;
  tick(); await flush();
  assert.deepEqual(requested, [true, true], 'failed history did not advance the 15-minute retry budget');
  assert.equal(snapshots.at(-1)?.rate, .0002);
  assert.deepEqual(snapshots.at(-1)?.history, [.00005, .00007]);

  now += 60_000;
  tick(); await flush();
  assert.deepEqual(requested, [true, true, false],
    'a stale settlement time cannot force history downloads after successful settlement refresh');
  assert.deepEqual(snapshots.at(-1)?.history, [.00005, .00007]);
  off();
});
