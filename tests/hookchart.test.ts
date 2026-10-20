import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_CHART_PROVIDER, chartProviderStorageKey, normalizeChartProvider, resolveChartProvider } from '../src/utils/chartPreferences';
import { hookChartHorizontalRange, formationChartMarkers, mergeLiveCandle, mergeProfileUpdate, replayChartMarkers, restoredHookViewport, toHookCandles } from '../src/utils/hookchartData';
import { INDICATOR_META, indicatorData, rsiSeries } from '../src/components/hookchart/indicatorEngine';
import { Chart, IndicatorDock, aggregateLiquidationsByCandle, calcCascadeRisk, isRoundPrice, roundPriceIncrement, type Liquidation, type Viewport } from '../src/components/hookchart/engine';
import { normalizeOriginalHookChartPreferences } from '../src/components/hookchart/OriginalHookChartSettings';
import { deriveAutoLevels } from '../src/components/hookchart/marketAnalytics';
import type { DetectedFormation, Kline, ReplayPendingOrder, ReplayPosition, UserProfile } from '../src/types';

const candle = (time: number, close = 10): Kline => ({ time, open: 10, high: Math.max(12, close), low: 8, close, volume: 100 });
const account: UserProfile = { uid: 'user-a', email: 'test@example.test', displayName: 'Test' };
const viewport: Viewport = { barWidth: 9, rightOffset: 0, autoY: true, manualCenter: null, manualRange: null };

test('large liquidation sums are bucketed under their real candle', () => {
  const candles = [
    { t: 0, o: 100, h: 102, l: 98, c: 101, v: 10, n: 1 },
    { t: 60_000, o: 101, h: 103, l: 99, c: 102, v: 10, n: 1 },
    { t: 120_000, o: 102, h: 104, l: 100, c: 103, v: 10, n: 1 },
  ];
  const rows: Liquidation[] = [
    { id: 'a', side: 'LONG', t: 65_000, p: 100, q: 200, usd: 20_000 },
    { id: 'b', side: 'SHORT', t: 80_000, p: 101, q: 100, usd: 10_000 },
    { id: 'c', side: 'LONG', t: 125_000, p: 102, q: 50, usd: 5_000 },
  ];
  assert.deepEqual(aggregateLiquidationsByCandle(candles, rows, 60_000), [
    { index: 1, t: 60_000, totalUsd: 30_000, longUsd: 20_000, shortUsd: 10_000, count: 2 },
    { index: 2, t: 120_000, totalUsd: 5_000, longUsd: 5_000, shortUsd: 0, count: 1 },
  ]);
});

test('Liq totals include only large real liquidation events and cascade uses recent flow', () => {
  const now = 300_000;
  const rows: Liquidation[] = [
    { id: 'large-long-now', side: 'LONG', t: now - 30_000, p: 100, q: 300, usd: 30_000 },
    { id: 'large-short-now', side: 'SHORT', t: now - 50_000, p: 100.2, q: 200, usd: 20_000 },
    { id: 'large-long-prev', side: 'LONG', t: now - 120_000, p: 99.8, q: 150, usd: 15_000 },
    { id: 'small', side: 'SHORT', t: now - 20_000, p: 100.1, q: 50, usd: 5_000 },
  ];
  const risk = calcCascadeRisk(rows, 10_000, 100, now);
  assert.equal(risk.threshold, 10_000);
  assert.equal(risk.total5, 65_000);
  assert.equal(risk.count5, 3);
  assert.equal(risk.total1, 50_000);
  assert.equal(risk.count1, 2);
  assert.equal(risk.longUsd, 45_000);
  assert.equal(risk.shortUsd, 20_000);
  assert.equal(risk.observedTotal5, 70_000);
  assert.equal(risk.observedCount5, 4);
  assert.equal(risk.hasData, true);
  assert.equal(risk.acceleration, 5);
  assert.ok(risk.score > 0);
  assert.equal(calcCascadeRisk([], 10_000, 100, now).hasData, false);
});

test('major decade and whole-number five-step prices are emphasized on the price scale', () => {
  assert.equal(roundPriceIncrement(100_000, 2), 5_000);
  assert.equal(roundPriceIncrement(4_000, 2), 50);
  assert.equal(roundPriceIncrement(2.5, 2), 0.05);
  for (const price of [1, 5, 10, 15, 55, 100, 105, 150, 250, 850, 1_000, 1_500, 2_500, 3_000, 5_500, 7_000, 8_000, 10_000, 30_000, 105_000])
    assert.equal(isRoundPrice(price, 8_000, 2), true, `${price} should be emphasized`);
  for (const price of [12, 37, 123, 147, 248, 4_251, 10_501])
    assert.equal(isRoundPrice(price, 8_000, 2), false, `${price} should stay regular`);
});

test('right padding migrates pixels to candle units and retains other chart preferences', () => {
  const drawings = { BTC: [{ id: 'BTC:level', type: 'level' as const, pts: [{ t: 60_000, p: 10 }] }] };
  const saved = { rightPadding: 150, showVolumes: false, drawings };
  const migrated = normalizeOriginalHookChartPreferences(saved);
  assert.equal(migrated.rightPadding, 10);
  assert.equal(migrated.rightPaddingEnabled, true);
  assert.equal(migrated.rightPaddingVersion, 2);
  assert.equal(migrated.showVolumes, false);
  assert.deepEqual(migrated.drawings, drawings);
  assert.equal(saved.rightPadding, 150, 'normalization must not mutate the saved profile');
  assert.equal(normalizeOriginalHookChartPreferences({ rightPadding: 64 }).rightPadding, 10);
  assert.equal(normalizeOriginalHookChartPreferences().rightPadding, 10);
  assert.deepEqual(normalizeOriginalHookChartPreferences(migrated), migrated);
  assert.equal(normalizeOriginalHookChartPreferences({ ...migrated, rightPadding: 40 }).rightPadding, 40);
  assert.equal(normalizeOriginalHookChartPreferences({ rightPadding: 500, rightPaddingVersion: 1 }).rightPadding, 10);
  assert.equal(normalizeOriginalHookChartPreferences({ ...migrated, rightPadding: 5.6 }).rightPadding, 6);
  assert.equal(normalizeOriginalHookChartPreferences({ ...migrated, rightPadding: -5 }).rightPadding, 0);
  assert.equal(normalizeOriginalHookChartPreferences({ ...migrated, rightPadding: 900 }).rightPadding, 500);
  assert.equal(normalizeOriginalHookChartPreferences({ ...migrated, rightPadding: NaN }).rightPadding, 10);
  assert.equal(normalizeOriginalHookChartPreferences({ ...migrated, rightPaddingEnabled: false }).rightPaddingEnabled, false);
});

test('5m automatic levels use five-minute timing for strength and lifetime calculations', () => {
  const rows = Array.from({ length: 150 }, (_, i) => {
    const center = 100 + Math.sin(i * Math.PI / 12) * 2;
    return { t: i * 300_000, o: center, h: center + 1, l: center - 1, c: center, v: 100, n: 0 };
  });
  const five = deriveAutoLevels(rows, '5m');
  const fifteen = deriveAutoLevels(rows.map(row => ({ ...row, t: row.t * 3 })), '15m');
  assert.ok(five.length > 0);
  assert.ok(five.every(level => level.tf === '5m'));
  const structural = (levels: ReturnType<typeof deriveAutoLevels>) => levels.map(({ p, kind, strength, visits, broken }) => ({ p, kind, strength, visits, broken }));
  assert.deepEqual(structural(five), structural(fifteen), 'equivalent candle sequences retain their structural strength across timeframe durations');
});

test('HookChart new-profile defaults hide large market print sums and use 1h/4h/1d levels', () => {
  const defaults = normalizeOriginalHookChartPreferences();
  assert.equal(defaults.showMarketPrintSums, false);
  assert.deepEqual(defaults.levelIntervals, ['1h', '4h', '1d']);
  assert.equal(normalizeOriginalHookChartPreferences({ showMarketPrintSums: true }).showMarketPrintSums, true,
    'an explicit user preference must not be overwritten by the new default');
  assert.equal(normalizeOriginalHookChartPreferences({ showMarketPrintSums: false }).showMarketPrintSums, false);
  assert.deepEqual(normalizeOriginalHookChartPreferences({ levelIntervals: ['5m'] }).levelIntervals, ['5m'],
    'saved per-profile level selections take priority over defaults');
});

test('HookChart settings remain isolated in each saved user profile', () => {
  const alice = mergeProfileUpdate({ uid: 'alice' }, {
    hookChartPreferences: { showMarketPrintSums: true, levelIntervals: ['1d'], candleLongColor: '#ffffff' },
  });
  const bob = mergeProfileUpdate({ uid: 'bob' }, {
    hookChartPreferences: { showMarketPrintSums: false, levelIntervals: ['1h', '4h', '1d'] },
  });
  const updatedAlice = mergeProfileUpdate(alice, { hookChartPreferences: { levelIntervals: ['4h'] } });
  assert.equal(updatedAlice.uid, 'alice');
  assert.equal(bob.uid, 'bob');
  assert.equal(updatedAlice.hookChartPreferences?.showMarketPrintSums, true);
  assert.deepEqual(updatedAlice.hookChartPreferences?.levelIntervals, ['4h']);
  assert.equal(updatedAlice.hookChartPreferences?.candleLongColor, '#ffffff');
  assert.equal(bob.hookChartPreferences?.showMarketPrintSums, false);
  assert.deepEqual(bob.hookChartPreferences?.levelIntervals, ['1h', '4h', '1d']);
});

test('automatic level preferences preserve selected timeframes and safely migrate existing profiles', () => {
  const defaults = normalizeOriginalHookChartPreferences();
  assert.deepEqual(defaults.levelIntervals, ['1h', '4h', '1d']);
  assert.equal(defaults.levelLabelColor, '#2090F0');
  assert.equal(defaults.levelLabelSize, 11);
  assert.equal(defaults.levelLabelStyle, 'text');
  assert.equal(defaults.levelLineStyle, 'solid');
  const selected = ['5m', '15m', '1h', '4h', '1d'];
  const saved = normalizeOriginalHookChartPreferences({ levelIntervals: selected, levelLabelColor: '#F2A900', levelLabelSize: 16, levelLabelStyle: 'filled', levelLineStyle: 'dash' });
  assert.deepEqual(saved.levelIntervals, selected, 'all five detection intervals can stay enabled');
  assert.notEqual(saved.levelIntervals, selected, 'normalization does not share the profile array');
  assert.deepEqual(normalizeOriginalHookChartPreferences(saved), saved, 'appearance survives repeated normalization');
  assert.deepEqual(normalizeOriginalHookChartPreferences({ levelIntervals: [] }).levelIntervals, [], 'disabling every interval stays disabled');
  const legacy = ['15m', '1h', '1h', '30m'];
  assert.deepEqual(normalizeOriginalHookChartPreferences({ levelIntervals: legacy }).levelIntervals, ['15m', '1h']);
  assert.deepEqual(legacy, ['15m', '1h', '1h', '30m']);
  assert.equal(normalizeOriginalHookChartPreferences({ levelLabelSize: NaN }).levelLabelSize, 11);
  assert.equal(normalizeOriginalHookChartPreferences({ levelLabelSize: 200 }).levelLabelSize, 20);
  assert.equal(normalizeOriginalHookChartPreferences({ levelLabelSize: 0 }).levelLabelSize, 0.2);
  assert.equal(normalizeOriginalHookChartPreferences({ levelLabelSize: 0.2 }).levelLabelSize, 0.2);
  assert.equal(normalizeOriginalHookChartPreferences({ levelLabelSize: 0.7 }).levelLabelSize, 0.7, 'fractional sizes must not round to whole pixels');
  assert.equal(normalizeOriginalHookChartPreferences({ levelLabelColor: 'invalid' }).levelLabelColor, '#2090F0');
});

test('right padding scales with candle width and fit-content includes the requested space', () => {
  for (const barWidth of [6, 9, 18]) {
    const range = hookChartHorizontalRange(80, 900, { ...viewport, barWidth }, 5);
    assert.equal(range.virtualEnd, 85);
    assert.equal((range.virtualEnd - 80) * range.step, 5 * barWidth);
  }
  assert.deepEqual(hookChartHorizontalRange(80, 900, { ...viewport, fitAll: true }, 10),
    { step: 10, virtualEnd: 90, virtualStart: 0 });
  assert.equal(hookChartHorizontalRange(80, 900, viewport, 0).virtualEnd, 80);
  assert.equal(hookChartHorizontalRange(80, 900, viewport, 0, 90).virtualEnd, 90,
    'standalone callers can still supply a pixel margin');
});

test('navigation and saved ranges can extend beyond the latest candle', () => {
  const future = { ...viewport, rightOffset: -30 };
  assert.equal(hookChartHorizontalRange(80, 900, future, 10).virtualEnd, 120);
  assert.equal(future.rightOffset, -30, 'geometry must not clamp or mutate navigation');
  assert.equal(hookChartHorizontalRange(80, 900, { ...viewport, rightOffset: 45 }, 10).virtualEnd, 45);
  const restored = restoredHookViewport(80, 846, { from: 0, to: 100 });
  assert.ok(restored);
  assert.equal(restored.rightOffset, -20);
  const range = hookChartHorizontalRange(80, 846, { ...restored, rightOffset: restored.rightOffset + 10 }, 10);
  assert.equal(range.virtualEnd, 100, 'adding the margin must retain the saved logical range');
  assert.ok(Math.abs(range.virtualStart) < 1e-10);
});

test('HookChart is the default and explicit profile choices take priority over account caches', () => {
  assert.equal(DEFAULT_CHART_PROVIDER, 'hookchart');
  assert.equal(normalizeChartProvider('hookchart'), 'hookchart');
  assert.equal(normalizeChartProvider('tradingview'), 'tradingview');
  for (const missing of [undefined, null, '', 'unknown']) {
    assert.equal(normalizeChartProvider(missing), 'hookchart');
  }
  assert.equal(resolveChartProvider('user-a', null), 'hookchart');
  assert.equal(resolveChartProvider('user-a', null, 'hookchart'), 'hookchart');
  assert.equal(resolveChartProvider('user-a', null, 'tradingview'), 'tradingview');
  assert.equal(resolveChartProvider('user-a', account, 'tradingview'), 'hookchart');
  assert.equal(resolveChartProvider('user-a', { ...account, defaultChartProvider: 'tradingview' }, 'hookchart'), 'tradingview');
  assert.equal(resolveChartProvider('user-a', { ...account, defaultChartProvider: 'hookchart' }, 'tradingview'), 'hookchart');
});

test('switching accounts or signing out does not reuse another account chart selection', () => {
  assert.notEqual(chartProviderStorageKey('user-a'), chartProviderStorageKey('user-b'));
  assert.equal(resolveChartProvider('user-b', { ...account, defaultChartProvider: 'tradingview' }), 'hookchart');
  assert.equal(resolveChartProvider('user-b', { ...account, defaultChartProvider: 'hookchart' }, 'tradingview'), 'tradingview');
  assert.equal(resolveChartProvider(undefined, { ...account, defaultChartProvider: 'tradingview' }, 'tradingview'), 'hookchart');
});

test('candle adapter sorts, deduplicates, converts seconds and excludes invalid exchange data', () => {
  const input = [candle(180), candle(60), candle(120), candle(120, 11), { ...candle(240), close: NaN }, { ...candle(300), low: 14 }];
  const converted = toHookCandles(input);
  assert.deepEqual(converted.map(row => row.t), [60_000, 120_000, 180_000]);
  assert.equal(converted[1].c, 11);
  assert.equal(converted[1].v, 100);
  assert.equal(input.length, 6, 'adapter must not mutate the exchange payload');
  assert.equal(toHookCandles([{ time: 60, open: 1e-10, high: 2e-10, low: 1e-11, close: 1.1e-10, volume: 0 }]).length, 1);
});

test('live ticks update the active candle, roll forward and reject stale or malformed ticks', () => {
  const initial = [candle(60), candle(120)];
  assert.equal(mergeLiveCandle(initial, candle(60, 11)), initial);
  assert.equal(mergeLiveCandle(initial, { ...candle(180), high: NaN }), initial);
  const updated = mergeLiveCandle(initial, candle(120, 11));
  assert.equal(updated.length, 2);
  assert.equal(updated[1].close, 11);
  const next = mergeLiveCandle(updated, candle(180), 2);
  assert.deepEqual(next.map(row => row.time), [120, 180]);
  assert.equal(initial[1].close, 10);
});

test('formation and archive markers preserve exact prices and visibility settings', () => {
  const formation = { levels: { entryPrice: 10, targetPrice: 12, stopLossPrice: 8, necklinePrice: 9, resistancePrice: 12, supportPrice: 7 } } as DetectedFormation;
  const markers = formationChartMarkers(formation, { entry: false, target: true, stop: false }, '4h');
  assert.ok(!markers.some(row => row.type === 'entry' || row.type === 'stop_loss'));
  assert.equal(markers.find(row => row.type === 'target')?.price, 12);
  assert.equal(markers.find(row => row.type === 'support')?.price, 7);
  assert.equal(markers.find(row => row.type === 'support')?.timeframe, '4h');
  assert.equal(markers.filter(row => row.price === 12).length, 1);
});

test('replay chart uses only supplied visible candles and keeps position and pending order levels', () => {
  const all = [candle(60), candle(120), candle(180), candle(240)];
  const visible = all.slice(0, 2);
  assert.deepEqual(toHookCandles(visible).map(row => row.t), [60_000, 120_000]);
  const position = { side: 'short', entryPrice: 10, slPrice: 12, tpPrice: 8, liquidationPrice: 14 } as ReplayPosition;
  const order: ReplayPendingOrder = { id: 'pending', symbol: 'BTCUSDT', side: 'buy', orderType: 'limit', price: 9, sizeUsd: 100, leverage: 2, createdAtTime: 120 };
  assert.deepEqual(replayChartMarkers(position, [order]).map(row => row.price), [10, 12, 8, 14, 9]);
});

test('profile writes preserve provider, other settings and drawings from several terminal blocks', () => {
  const first = mergeProfileUpdate(account, { defaultChartProvider: 'hookchart', hookChartPreferences: { showVolumes: false, drawings: { BTC: [{ id: 'BTC:x', type: 'level', pts: [{ t: 60_000, p: 10 }] }] } } });
  const second = mergeProfileUpdate(first, { timeZone: 'Europe/Kyiv', hookChartPreferences: { indicators: ['rsi'], drawings: { ETH: [] } } });
  const third = mergeProfileUpdate(second, { defaultChartProvider: 'tradingview' });
  assert.equal(third.defaultChartProvider, 'tradingview');
  assert.equal(third.timeZone, 'Europe/Kyiv');
  assert.equal(third.hookChartPreferences?.showVolumes, false);
  assert.equal(third.hookChartPreferences?.drawings?.BTC.length, 1);
  assert.deepEqual(third.hookChartPreferences?.drawings?.ETH, []);
  assert.deepEqual(third.hookChartPreferences?.indicators, ['rsi']);
});

test('archive viewport restores logical bar indices rather than interpreting them as timestamps', () => {
  assert.deepEqual(restoredHookViewport(1000, 720, { from: 0, to: 80 }), { barWidth: 9, rightOffset: 920, autoY: true, manualCenter: null, manualRange: null, fitAll: false });
  assert.equal(restoredHookViewport(100, 720, { from: 20, to: 20 }), null);
});

test('all supplied indicators emit finite values without accessing future candles', () => {
  const visible = toHookCandles(Array.from({ length: 80 }, (_, i) => candle(60 * (i + 1), 9 + Math.sin(i) * 2)));
  for (const meta of INDICATOR_META.filter(meta => meta.id !== 'oi')) {
    const data = indicatorData(meta.id, visible, { binance: [], bybit: [] });
    assert.ok(data.series.some(row => row.values.length), meta.id);
    for (const point of data.series.flatMap(row => row.values)) { assert.ok(Number.isFinite(point.v), meta.id); assert.ok(point.t <= visible.at(-1)!.t, meta.id); }
  }
  const flat = toHookCandles(Array.from({ length: 30 }, (_, i) => candle(60 * (i + 1))));
  assert.equal(rsiSeries(flat).at(-1), 50);
});

test('several terminal indicator panels have distinct SVG ids and replay hides live date jumps', () => {
  const candles = toHookCandles(Array.from({ length: 40 }, (_, i) => candle(60 * (i + 1), 9 + Math.sin(i))));
  const panels = renderToStaticMarkup(React.createElement('div', {}, ...[0, 1].map(key => React.createElement(IndicatorDock, { key, ids: ['rsi'], candles, oi: { binance: [], bybit: [] }, viewport, rightPadding: 0, onToggle() {} }))));
  const ids = [...panels.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  const chart = renderToStaticMarkup(React.createElement(Chart, { candles, symbol: '龙虾USDT', tf: '1m', tool: 'cursor', drawings: [], setDrawings() {}, alerts: [], setAlerts() {}, densities: [], marketPrints: [], liquidations: [], autoLevels: [], cascadeRisk: { score: 0, level: 'LOW', total5: 0, count5: 0, longUsd: 0, shortUsd: 0 }, levelLabelMode: 'always', hideTimeJump: true, showLiqRiskBlock: false }));
  assert.ok(chart.includes('<canvas'));
  assert.ok(!chart.includes('timeJumpButton'));
  assert.ok(!chart.includes('barCountdown'));
});
