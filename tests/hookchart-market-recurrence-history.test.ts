import test from 'node:test';
import assert from 'node:assert/strict';
import type { Kline } from '../src/types';
import type { HistoryPageRequest } from '../src/utils/sharedHistoricalKlines';
import { createMarketRecurrenceHistoryLoader, reusableRecurrenceHistory } from '../src/components/hookchart/marketRecurrenceHistory';

const STEP = 300_000;
const NOW = Date.UTC(2026, 10, 17, 20, 0, 0);
const START = NOW - 7 * 86_400_000;
const week: Kline[] = Array.from({ length: 2016 }, (_, i) => ({
  time: (START + i * STEP) / 1000,
  open: 100, high: 101, low: 99, close: 100, volume: 100,
}));
const request = (signal?: AbortSignal) => ({
  exchange: 'binance' as const, marketType: 'futures' as const,
  symbol: 'BTCUSDT', chartTimeframe: '1m', existing: [], nowMs: NOW, signal,
});
function mockPages(records: Kline[] = week) {
  const calls: HistoryPageRequest[] = [];
  const fetcher = async (req: HistoryPageRequest): Promise<Kline[]> => {
    calls.push(req);
    const eligible = records.filter(bar => req.endTime === undefined || bar.time * 1000 <= req.endTime);
    return eligible.slice(-req.limit);
  };
  return { fetcher, calls };
}

test('1m fetches only paginated 5m base history, no 1m REST pages', async () => {
  const { calls, fetcher } = mockPages();
  const loader = createMarketRecurrenceHistoryLoader(fetcher);
  const bars = await loader(request());
  assert.equal(bars.length, 2016);
  assert.equal(bars[0].t, START);
  assert.equal(bars.at(-1)?.t, NOW - STEP);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(c => c.timeframe === '5m' && c.symbol === 'BTCUSDT'));
  const again = await loader(request());
  assert.equal(again, bars);
  assert.equal(calls.length, 3);
});

test('two simultaneous charts share a single history load; disabling one leaves the other intact', async () => {
  const { calls, fetcher } = mockPages();
  const loader = createMarketRecurrenceHistoryLoader(fetcher);
  const a = new AbortController();
  const first = loader(request(a.signal));
  const second = loader(request());
  a.abort();
  await assert.rejects(first, { name: 'AbortError' });
  assert.equal((await second).length, 2016);
  assert.equal(calls.length, 3);
});

test('after the last chart is disabled, no further historical pages are requested', async () => {
  let finish!: (value: Kline[]) => void;
  let started!: () => void;
  const startedPromise = new Promise<void>(resolve => { started = resolve; });
  let calls = 0;
  const loader = createMarketRecurrenceHistoryLoader(async () => {
    calls++;
    started();
    return await new Promise<Kline[]>(resolve => { finish = resolve; });
  });
  const controller = new AbortController();
  const pending = loader(request(controller.signal));
  await startedPromise;
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  finish(week.slice(-1000));
  // Yield to the loader's continuation and settled promise handlers.
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 1);
});

test('one chart with a complete native 5m series makes zero new REST calls', async () => {
  const { calls, fetcher } = mockPages();
  const loader = createMarketRecurrenceHistoryLoader(fetcher);
  const existing = week.map(bar => ({
    t: bar.time * 1000, o: bar.open, h: bar.high, l: bar.low,
    c: bar.close, v: bar.volume,
  }));
  const bars = await loader({ ...request(), chartTimeframe: '5m', existing });
  assert.equal(bars.length, 2016);
  assert.equal(calls.length, 0);
});

test('stale native history refreshes latest candles before paging backwards', async () => {
  const { calls, fetcher } = mockPages();
  const loader = createMarketRecurrenceHistoryLoader(fetcher);
  const existing = week.slice(50, 120).map(bar => ({
    t: bar.time * 1000, o: bar.open, h: bar.high, l: bar.low,
    c: bar.close, v: bar.volume,
  }));
  const bars = await loader({ ...request(), chartTimeframe: '5m', existing });
  assert.equal(bars.length, 2016);
  assert.equal(bars[0].t, START);
  assert.equal(bars.at(-1)?.t, NOW - STEP);
  assert.ok(calls.some(c => c.endTime === undefined));
});

test('a gap in the chart history is repaired from the latest contiguous suffix', async () => {
  const { calls, fetcher } = mockPages();
  const loader = createMarketRecurrenceHistoryLoader(fetcher);
  const existing = week.filter((_, i) => i !== 1000).map(bar => ({
    t: bar.time * 1000, o: bar.open, h: bar.high, l: bar.low,
    c: bar.close, v: bar.volume,
  }));
  const bars = await loader({ ...request(), chartTimeframe: '5m', existing });
  assert.equal(bars.length, 2016);
  assert.equal(bars[0].t, START);
  assert.equal(bars[1000].t, START + 1000 * STEP);
  assert.ok(calls.length >= 1);
});

test('cancelled shared history does not poison the cache for later re-enabling', async () => {
  let finish!: (value: Kline[]) => void;
  let started!: () => void;
  let firstCall = true;
  let calls = 0;
  const loader = createMarketRecurrenceHistoryLoader(async req => {
    calls++;
    if (firstCall) {
      firstCall = false;
      started();
      return await new Promise<Kline[]>(resolve => { finish = resolve; });
    }
    return week.filter(b => req.endTime === undefined || b.time * 1000 <= req.endTime).slice(-req.limit);
  });
  const startedPromise = new Promise<void>(resolve => { started = resolve; });
  const signal = new AbortController();
  const first = loader(request(signal.signal));
  await startedPromise;
  signal.abort();
  await assert.rejects(first, { name: 'AbortError' });
  finish(week.slice(-1000));
  await new Promise(resolve => setTimeout(resolve, 0));
  const again = await loader(request());
  assert.equal(again.length, 2016);
  assert.ok(calls >= 4);
});

test('the next 5m candle reuses week history and fetches only a tiny latest page', async () => {
  const next: Kline = {
    time: NOW / 1000, open: 101, high: 102, low: 100,
    close: 101.5, volume: 130,
  };
  const { calls, fetcher } = mockPages([...week, next]);
  const loader = createMarketRecurrenceHistoryLoader(fetcher);
  const initial = await loader(request());
  assert.equal(initial.length, 2016);
  const initialCalls = calls.length;
  assert.equal(initialCalls, 3);
  const updated = await loader({ ...request(), nowMs: NOW + STEP });
  assert.equal(updated.length, 2016);
  assert.equal(updated[0].t, START + STEP);
  assert.equal(updated.at(-1)?.t, NOW);
  assert.equal(calls.length, initialCalls + 1);
  assert.equal(calls.at(-1)?.timeframe, '5m');
  assert.equal(calls.at(-1)?.endTime, undefined);
  assert.equal(calls.at(-1)?.limit, 3);
});

test('a second chart shares the tiny rollover request rather than refetching seven days', async () => {
  const next: Kline = {
    time: NOW / 1000, open: 101, high: 102, low: 100,
    close: 101.5, volume: 130,
  };
  const { calls, fetcher } = mockPages([...week, next]);
  const loader = createMarketRecurrenceHistoryLoader(fetcher);
  await loader(request());
  const previousCalls = calls.length;
  const [first, second] = await Promise.all([
    loader({ ...request(), nowMs: NOW + STEP }),
    loader({ ...request(), nowMs: NOW + STEP }),
  ]);
  assert.strictEqual(first, second);
  assert.equal(first.length, 2016);
  assert.equal(calls.length, previousCalls + 1);
});

test('36 enabled Terminal chart scopes never exceed two concurrent REST history pages', async () => {
  let active = 0, peak = 0, requests = 0;
  const loader = createMarketRecurrenceHistoryLoader(async req => {
    active++;
    requests++;
    peak = Math.max(peak, active);
    try {
      // Force overlapping requests without clocks or network access.
      await Promise.resolve();
      await Promise.resolve();
      return week
        .filter(bar => req.endTime === undefined || bar.time * 1000 <= req.endTime)
        .slice(-req.limit);
    } finally {
      active--;
    }
  });
  const rows = await Promise.all(Array.from({ length: 36 }, (_, i) =>
    loader({ ...request(), symbol: 'TEST' + String(i) + 'USDT' })));
  assert.equal(peak, 2);
  assert.equal(requests, 36 * 3);
  assert.ok(rows.every(series => series.length === 2016));
});


test('a complete previous week may be rolled forward using a 3-candle page', () => {
  const valid = week.map(k => ({
    t: k.time * 1000, o: k.open, h: k.high, l: k.low,
    c: k.close, v: k.volume,
  }));
  assert.equal(reusableRecurrenceHistory(valid, STEP, NOW - STEP), true);
});

test('a gapped or stale previous week cannot be patched with only three latest candles', () => {
  const records = week.map(k => ({
    t: k.time * 1000, o: k.open, h: k.high, l: k.low,
    c: k.close, v: k.volume,
  }));
  assert.equal(reusableRecurrenceHistory(records.filter((_, i) => i !== 800), STEP, NOW - STEP), false);
  assert.equal(reusableRecurrenceHistory(records.slice(0, -15), STEP, NOW - STEP), false);
  assert.equal(reusableRecurrenceHistory(records, STEP, NOW), false);
});

test('an incomplete previous cache generation is rebuilt before the next week rollover', async () => {
  let available: Kline[] = week.filter((_, i) => i !== 800);
  const calls: HistoryPageRequest[] = [];
  const loader = createMarketRecurrenceHistoryLoader(async req => {
    calls.push(req);
    return available
      .filter(row => req.endTime === undefined || row.time * 1000 <= req.endTime)
      .slice(-req.limit);
  });
  const first = await loader(request());
  assert.equal(first.length, 2015);
  const before = calls.length;
  available = [...week, {
    time: NOW / 1000, open: 100, high: 101, low: 99, close: 100, volume: 100,
  }];
  const next = await loader({ ...request(), nowMs: NOW + STEP });
  assert.equal(next.length, 2016);
  assert.equal(next[0].t, START + STEP);
  assert.equal(next.at(-1)?.t, NOW);
  assert.equal(calls[before].limit, 1000, 'a gap requires a full latest page, not a 3-bar patch');
});
