import test from 'node:test';
import assert from 'node:assert/strict';
import { TerminalThirtySecondAccumulator, TERMINAL_30S_MS, createTerminalThirtySecondSubscriptions } from '../src/components/hookchart/terminalThirtySecondCandles';

import type { subscribeMarketTrades } from '../src/components/hookchart/marketTradeStream';

const start = 1_800_000_000_000;
const trade = (offset: number, p: number, usd: number, side: 'BUY' | 'SELL' = 'BUY') => ({
  id: String(offset), t: start + offset, p, usd, side,
});

test('30s candles come from individual exchange trades, not invented 1m splits', () => {
  const accumulator = new TerminalThirtySecondAccumulator();
  assert.equal(TERMINAL_30S_MS, 30_000);
  assert.equal(accumulator.accept(trade(10_000, 100, 1000)), true);
  assert.deepEqual(accumulator.snapshot(), [], 'seed may start mid-bar: hide its incomplete bucket');
  accumulator.accept(trade(30_001, 105, 525, 'BUY'));
  accumulator.accept(trade(31_000, 110, 220, 'SELL'));
  accumulator.accept(trade(33_000, 95, 190, 'BUY'));
  const rows = accumulator.snapshot();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].time, (start + 30_000) / 1000);
  assert.deepEqual([rows[0].open, rows[0].high, rows[0].low, rows[0].close], [105, 110, 95, 95]);
  assert.ok(Math.abs(rows[0].volume - 9) < 1e-10);
  assert.ok(Math.abs((rows[0].buyVolume ?? 0) - 7) < 1e-10);
  assert.equal(rows[0].quoteVolume, 935);
  // Binance aggTrade packets can represent multiple executions. Do not
  // advertise packet count as the number of individual exchange trades.
  assert.equal(rows[0].tradeCount, undefined);
});

test('boundary is exactly 30s UTC and missing intervals remain missing', () => {
  const a = new TerminalThirtySecondAccumulator();
  a.accept(trade(1, 10, 10));
  a.accept(trade(30_000, 11, 11));
  a.accept(trade(59_999, 12, 12));
  a.accept(trade(60_000, 13, 13));
  assert.deepEqual(a.snapshot().map(row => row.time), [
    (start + 30_000) / 1000, (start + 60_000) / 1000,
  ]);
  assert.deepEqual(a.snapshot().map(row => row.close), [12, 13]);
});

test('a legitimate trading pause retains closed 30s history and never invents flat candles', () => {
  const a = new TerminalThirtySecondAccumulator();
  a.accept(trade(100, 10, 10));
  a.accept(trade(30_100, 11, 11));
  assert.equal(a.snapshot().length, 1);
  // More than two minutes can pass without a single execution on an
  // illiquid market; a transport interruption is a separate explicit event.
  a.accept(trade(200_100, 20, 20));
  a.accept(trade(205_100, 21, 21));
  a.accept(trade(240_100, 22, 22));
  const rows = a.snapshot();
  assert.deepEqual(rows.map(row => row.time), [
    (start + 30_000) / 1000,
    (start + 180_000) / 1000,
    (start + 240_000) / 1000,
  ]);
  assert.deepEqual(rows.map(row => row.open), [11, 20, 22]);
  assert.deepEqual(rows.map(row => row.close), [11, 21, 22]);
  // The late trade must not rewind an already published candle.
  assert.equal(a.accept(trade(239_999, 100, 100)), false);
});

test('ignore stale and invalid trade updates and keep published snapshots immutable', () => {
  const a = new TerminalThirtySecondAccumulator();
  a.accept(trade(100, 10, 20));
  a.accept(trade(30_100, 11, 22));
  const original = a.snapshot();
  assert.equal(a.accept(trade(30_050, 100, 100)), false);
  assert.equal(a.accept(trade(31_000, 0, 10)), false);
  a.accept(trade(31_000, 12, 12));
  assert.equal(original[0].close, 11);
  assert.equal(a.snapshot()[0].close, 12);
  a.reset();
  assert.deepEqual(a.snapshot(), []);
});

test('identical Terminal panels share one feed and ignore unverified trades until recovery', async () => {
  type TradeListener = Parameters<typeof subscribeMarketTrades>[1];
  let source: TradeListener | undefined;
  let upstreamSubscriptions = 0;
  let upstreamStops = 0;
  const fakeSubscribe: typeof subscribeMarketTrades = (_scope, listener) => {
    upstreamSubscriptions++;
    source = listener;
    listener.onIntegrity?.('verified');
    return () => { upstreamStops++; };
  };
  const pool = createTerminalThirtySecondSubscriptions(fakeSubscribe);
  const scope = { exchange: 'binance' as const, marketType: 'futures' as const, symbol: 'BTCUSDT' };
  const updatesA: number[] = [];
  const updatesB: number[] = [];
  const unsubscribeA = pool.subscribe(scope, rows => updatesA.push(rows.length));
  const unsubscribeBad = pool.subscribe(scope, () => { throw new Error('one broken card'); });
  const unsubscribeB = pool.subscribe(scope, rows => updatesB.push(rows.length));
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  try {
    assert.equal(upstreamSubscriptions, 1);
    assert.equal(pool.activeFeeds(), 1);
    assert.ok(source);
    source!.onTrade(trade(10_000, 100, 100));
    source!.onTrade(trade(31_000, 110, 220));
    await delay(290);
    assert.equal(updatesA.at(-1), 1);
    assert.equal(updatesB.at(-1), 1);

    source!.onIntegrity?.('recovering');
    source!.onTrade(trade(62_000, 120, 240));
    source!.onTrade(trade(93_000, 130, 260));
    await delay(290);
    assert.equal(updatesA.at(-1), 0, 'unverified gap must clear old bars');
    assert.equal(updatesB.at(-1), 0, 'unverified trades must never form new candles');

    source!.onIntegrity?.('verified');
    source!.onTrade(trade(100_000, 120, 120));
    source!.onTrade(trade(121_000, 125, 125));
    await delay(290);
    assert.equal(updatesA.at(-1), 1, 'first complete post-recovery bucket is published');
    assert.equal(updatesB.at(-1), 1);

    // An ordinary Binance/Bybit socket close has no verified backfill.
    // Short outages are dangerous too: a 5-second gap must invalidate the
    // current trade-derived bar instead of quietly undercounting its volume.
    source!.onStreamInterrupted?.();
    await delay(290);
    assert.equal(updatesA.at(-1), 0, 'disconnect clears unverified 30s volume');
    assert.equal(updatesB.at(-1), 0);
    source!.onTrade(trade(124_000, 130, 130));
    source!.onTrade(trade(150_001, 131, 131));
    await delay(290);
    assert.equal(updatesA.at(-1), 0, 'REST replay during transport outage cannot create fake OHLCV');

    source!.onStreamResumed?.();
    source!.onTrade(trade(160_000, 130, 130));
    await delay(290);
    assert.equal(updatesA.at(-1), 0, 'first partial post-reconnect bucket is hidden');
    source!.onTrade(trade(180_001, 131, 131));
    await delay(290);
    assert.equal(updatesA.at(-1), 1, 'post-reconnect full bucket is real');
    assert.equal(updatesB.at(-1), 1);
  } finally {
    unsubscribeA();
    unsubscribeBad();
    unsubscribeB();
  }
  await delay(1_550);
  assert.equal(pool.activeFeeds(), 0);
  assert.equal(upstreamStops, 1, 'one unsubscribe closes the shared source after its grace period');
});

test('trade-derived 30s history remains bounded for long-running Terminal tabs', () => {
  const accumulator = new TerminalThirtySecondAccumulator();
  for (let i = 0; i < 500; i++) {
    accumulator.accept(trade(i * 30_000 + 100, 100 + i, 100 + i));
  }
  const rows = accumulator.snapshot();
  assert.ok(rows.length > 0 && rows.length <= 360);
  assert.equal(rows.at(-1)?.close, 599);
  assert.ok(rows.every((row, i) => !i || row.time > rows[i - 1].time));
});

test('30s stays available in the shared Terminal grid without inventing older exchange history', async () => {
  const { readFileSync } = await import('node:fs');
  const file = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const terminal = file('../src/components/TerminalPage.tsx');
  const widget = file('../src/components/terminal/TerminalChartWidget.tsx');
  const wrapper = file('../src/components/ExchangeCandlestickChart.tsx');
  const chart = file('../src/components/TradingViewChart.tsx');
  const hook = file('../src/components/hookchart/HookChartCanvas.tsx');
  assert.match(terminal, /<TerminalGridItem/);
  assert.match(widget, /timeframe=\{block\.timeframe\}/);
  assert.match(widget, /terminalMode=\{useIntegratedHookChartToolbar\}/);
  assert.match(wrapper, /terminalMode=\{terminalMode\}/);
  assert.match(wrapper, /terminalThirtySecondMode=\{terminalThirtySecondMode\}/);
  assert.match(chart, /const terminalTradeCandles = timeframe === '30s' && \(terminalMode \|\| terminalThirtySecondMode\)/);
  assert.match(hook, /timeframe === '30s' \|\| \(terminalMode && historyRetry === 0\)/);
  assert.match(hook, /if \(timeframe === '30s'\) continue;/);
});

test('30s transport status stays connected without trades and ignores candle-open age', async () => {
  type TradeListener = Parameters<typeof subscribeMarketTrades>[1];
  let upstream: TradeListener | undefined;
  const pool = createTerminalThirtySecondSubscriptions((_scope, listener) => {
    upstream = listener;
    listener.onIntegrity?.('verified');
    listener.onTransportStatus?.(false);
    return () => {};
  });
  const scope = { exchange: 'bybit' as const, marketType: 'spot' as const, symbol: 'XRPUSDT' };
  const statusesA: boolean[] = [];
  const statusesB: boolean[] = [];
  const unsubscribeA = pool.subscribe(scope, () => {}, connected => statusesA.push(connected));
  const unsubscribeB = pool.subscribe(scope, () => {}, connected => statusesB.push(connected));
  try {
    assert.deepEqual(statusesA, [false]);
    assert.deepEqual(statusesB, [false]);
    assert.ok(upstream);
    upstream!.onTransportStatus?.(true);
    assert.deepEqual(statusesA, [false, true]);
    assert.deepEqual(statusesB, [false, true]);
    // No trade occurs: a real WebSocket connection remains healthy while
    // an illiquid market has no candles to display.
    assert.equal(statusesA.at(-1), true);

    upstream!.onStreamInterrupted?.();
    assert.equal(statusesA.at(-1), false);
    upstream!.onTransportStatus?.(true);
    assert.equal(statusesA.at(-1), false, 'new socket open is not verified execution continuity');
    upstream!.onStreamResumed?.();
    assert.equal(statusesA.at(-1), true, 'first live trade confirms the recovered stream');
    upstream!.onIntegrity?.('recovering');
    assert.equal(statusesA.at(-1), false);
    upstream!.onIntegrity?.('verified');
    assert.equal(statusesA.at(-1), true);
    assert.deepEqual(statusesB, statusesA, 'every card receives the same shared status');
  } finally {
    unsubscribeA();
    unsubscribeB();
  }
  await new Promise(resolve => setTimeout(resolve, 1_550));
  assert.equal(pool.activeFeeds(), 0);
});

test('30s UI uses actual WS connection state instead of an inactive market candle timestamp', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/components/TradingViewChart.tsx', import.meta.url), 'utf8');
  const section = source.slice(source.indexOf('// Terminal-only 30s OHLCV uses'),
    source.indexOf('// Update latest price ref and initialize active candle'));
  assert.match(section, /connected => \{/);
  assert.match(section, /setIsLiveConnected\(connected\)/);
  assert.doesNotMatch(section, /Date\.now\(\) - last\.time \* 1000/);
});
