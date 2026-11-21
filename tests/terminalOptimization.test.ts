import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSharedPublicChartPoller } from '../src/utils/sharedPublicChartPolling';
import { terminalRenderIntervalMs } from '../src/utils/terminalRenderPolicy';
import { fetchSharedHistoricalKlines, sharedHistoricalKlineKey } from '../src/utils/sharedHistoricalKlines';
import { mergeTerminalOlderHistory } from '../src/utils/hookChartHistory';

test('Terminal paint budget is adaptive, without changing exchange ticks', () => {
  assert.equal(terminalRenderIntervalMs(1, false), 80);
  assert.equal(terminalRenderIntervalMs(4, false), 80);
  assert.equal(terminalRenderIntervalMs(5, false), 110);
  assert.equal(terminalRenderIntervalMs(12, false), 110);
  assert.equal(terminalRenderIntervalMs(13, false), 140);
  assert.equal(terminalRenderIntervalMs(24, false), 140);
  assert.equal(terminalRenderIntervalMs(25, false), 180);
  assert.equal(terminalRenderIntervalMs(50, true), 200);
});

test('History cache key preserves market, timeframe, international symbol and cursor', () => {
  const basic = { exchange: 'binance' as const, marketType: 'futures' as const,
    symbol: 'BTC/USDT', timeframe: '1m' as const, limit: 180 };
  assert.equal(sharedHistoricalKlineKey(basic),
    sharedHistoricalKlineKey({ ...basic, symbol: 'BTCUSDT' }));
  assert.notEqual(sharedHistoricalKlineKey(basic),
    sharedHistoricalKlineKey({ ...basic, exchange: 'bybit' }));
  assert.notEqual(sharedHistoricalKlineKey(basic),
    sharedHistoricalKlineKey({ ...basic, timeframe: '5m' }));
  assert.notEqual(sharedHistoricalKlineKey(basic),
    sharedHistoricalKlineKey({ ...basic, endTime: 1_733_000_000_000 }));
  assert.ok(sharedHistoricalKlineKey({ ...basic, symbol: '龙虾USDT' }).includes('龙虾USDT'));
});

test('Identical historical page requests share one public fetch and obey the cursor', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = (async () => {
      calls += 1;
      return {
        ok: true, json: async () => ({
          success: true,
          data: [
            { time: 100, open: 1, high: 2, low: 1, close: 2, volume: 10 },
            { time: 200, open: 2, high: 3, low: 2, close: 3, volume: 11 },
          ],
        }),
      } as Response;
    }) as typeof fetch;
    const request = { exchange: 'binance' as const, marketType: 'futures' as const,
      symbol: 'TESTHISTORYUSDT', timeframe: '1m' as const,
      endTime: 150_000, limit: 180 };
    const [first, second] = await Promise.all([
      fetchSharedHistoricalKlines(request), fetchSharedHistoricalKlines({ ...request }),
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(first.map(row => row.time), [100]);
    assert.deepEqual(second.map(row => row.time), [100]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Repeated older-history scrolls preserve all intermediate bars and their chronology', () => {
  const bar = (time: number) => ({ time, open: 1, high: 2, low: 1, close: 2, volume: 10 });
  const first = mergeTerminalOlderHistory([], [bar(80), bar(90), bar(100), bar(110)],
    100_000, 7);
  assert.deepEqual(first.map(b => b.time), [80, 90, 100]);
  const second = mergeTerminalOlderHistory(first, [bar(60), bar(70), bar(80), bar(90)],
    79_999, 7);
  assert.deepEqual(second.map(b => b.time), [60, 70, 80, 90, 100]);
  assert.deepEqual(mergeTerminalOlderHistory(second, [bar(40), bar(50)], 59_999, 4)
    .map(b => b.time), [70, 80, 90, 100]);
  assert.deepEqual(mergeTerminalOlderHistory(second, [bar(10)], 9_999, 0), []);
});

test('Matching public poll subscriptions share one timer, result and cleanup', async () => {
  let now = 5_000;
  let seq = 0;
  let calls = 0;
  const timers = new Map<number, () => void>();
  const cancelled: number[] = [];
  const poller = createSharedPublicChartPoller({
    now: () => now,
    every: callback => {
      const id = ++seq;
      timers.set(id, callback);
      return id as unknown as ReturnType<typeof setInterval>;
    },
    cancel: timer => {
      cancelled.push(timer as unknown as number);
      timers.delete(timer as unknown as number);
    },
  });
  const receivedA: number[] = [];
  const receivedB: number[] = [];
  const loader = async () => ++calls;
  const a = poller.subscribe('oi:BTCUSDT:1m', loader,
    { onData: value => receivedA.push(value) });
  const b = poller.subscribe('oi:BTCUSDT:1m', loader,
    { onData: value => receivedB.push(value) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(poller.activeKeys(), 1);
  assert.equal(timers.size, 1);
  assert.equal(calls, 1);
  assert.deepEqual(receivedA, [1]);
  assert.deepEqual(receivedB, [1]);

  now += 60_000;
  for (const tick of [...timers.values()]) tick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.deepEqual(receivedA, [1, 2]);
  assert.deepEqual(receivedB, [1, 2]);
  a();
  assert.equal(poller.activeKeys(), 1);
  b();
  assert.equal(poller.activeKeys(), 0);
  assert.equal(timers.size, 0);
  assert.equal(cancelled.length, 1);
});

test('Terminal keeps live feeds separate from optional polls and history', () => {
  const hook = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
  const terminal = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  const sharedKlines = readFileSync(new URL('../src/components/hookchart/sharedKlineStream.ts', import.meta.url), 'utf8');
  const chart = readFileSync(new URL('../src/components/TradingViewChart.tsx', import.meta.url), 'utf8');
  assert.match(hook, /\(timeframe === '5s' \|\| timeframe === '30s'\) \|\| \(terminalMode && historyRetry === 0\)/);
  assert.match(hook, /fetchSharedHistoricalKlines/);
  assert.match(hook, /sharedPublicChartPolling\.subscribe/);
  assert.match(terminal, /marketRefreshDemandRef/);
  assert.match(terminal, /getCoinsForPicker/);
  assert.match(terminal, /TerminalGridItem/);
  assert.match(sharedKlines, /sameOriginWindow/);
  assert.match(chart, /terminalChartUiIntervalMs/);
  const refresh = readFileSync(new URL('../src/utils/terminalChartRefresh.ts', import.meta.url), 'utf8');
  assert.match(refresh, /terminalRenderIntervalMs\(activeCharts, ecoMode\)/);
});
