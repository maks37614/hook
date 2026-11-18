import test from 'node:test';
import assert from 'node:assert/strict';
import type { DetectedFormation, Kline, MarketCoin, ScannedCoin, ScreenerFilterState } from '../src/types';
import { alignEarlyFormationToTick, defaultEarlyFormationLevelVisibility, detectEarlyReversalFormations, earlyFormationChartMarkers, evaluateEarlyTradePlans, filterEarlyFormationChartMarkers, prepareEarlyFormationCandles } from '../src/utils/earlyFormations';
import { createEarlyModeFilters, findCurrentEarlyFormation, getVisibleEarlyFormations } from '../src/utils/earlyFormationList';
import { selectDirectEarlyScanCandidates } from '../src/utils/directExchangeClient';

const start = 1_700_000_000;
function rows(shape: 'W' | 'M' | 'flat', broken = false): Kline[] {
  const candles = Array.from({ length: 60 }, (_, i) => {
    let close = 105;
    if (shape !== 'flat') {
      const w = i <= 19 ? 108 - 8 * i / 19 :
        i <= 35 ? 100 + 8 * (i - 19) / 16 : 108 - 7.2 * (i - 35) / 24;
      close = shape === 'W' ? w : 208 - w;
      if (broken && i >= 56) close = shape === 'W' ? 97.5 : 110.5;
    }
    return { time: start + i * 300, open: close, high: close + .15, low: close - .15, close, volume: 10 };
  });
  return candles;
}
test('early W appears before confirmed second low, with actionable geometry explicitly tentative', () => {
  const candidates = detectEarlyReversalFormations(rows('W'), 'BTCUSDT');
  const w = candidates.find(c => c.patternKey === 'double_bottom');
  assert.ok(w, 'preliminary double bottom was not detected');
  assert.equal(w.bias, 'bullish');
  assert.equal(w.stage, 'forming');
  assert.ok(w.stopLoss < w.earlyEntryMin);
  assert.ok(w.earlyEntryMin < w.earlyEntryMax);
  assert.ok(w.earlyEntryMax < w.neckline);
  assert.ok(w.stopLoss < w.breakoutStopLoss);
  assert.ok(w.breakoutStopLoss < w.neckline);
  assert.ok(w.neckline < w.breakoutEntry);
  assert.ok(w.breakoutEntry < w.target);
  assert.ok(w.breakoutRiskReward > 0);
  assert.ok(w.earlyRiskReward >= 1);
  const markers = earlyFormationChartMarkers(w);
  assert.equal(markers.length, 7);
  assert.ok(markers.some(m => m.type === 'entry' && m.price === w.earlyEntryMin));
  assert.ok(markers.some(m => m.type === 'entry' && m.price === w.earlyEntryMax));
  assert.equal(markers.filter(m => m.type === 'stop_loss').length, 2);
  assert.ok(markers.some(m => m.label === 'SL після пробою' && m.price === w.breakoutStopLoss));
  assert.ok(markers.some(m => m.type === 'entry'));
  assert.ok(markers.some(m => m.type === 'target'));
  assert.ok(markers.some(m => m.type === 'stop_loss'));
});

test('early M produces a short setup with the stop above the projected neckline', () => {
  const m = detectEarlyReversalFormations(rows('M'), 'ETHUSDT').find(c => c.patternKey === 'double_top');
  assert.ok(m);
  assert.equal(m.bias, 'bearish');
  assert.ok(m.stopLoss > m.earlyEntryMax);
  assert.ok(m.breakoutStopLoss < m.stopLoss);
  assert.ok(m.breakoutStopLoss > m.neckline);
  assert.ok(m.breakoutEntry < m.neckline);
  assert.ok(m.neckline < m.earlyEntryMin);
  assert.ok(m.target < m.breakoutEntry);
});

test('flat prices and invalidated anchor pivots are not advertised as early formations', () => {
  assert.deepEqual(detectEarlyReversalFormations(rows('flat'), 'SOLUSDT'), []);
  assert.equal(detectEarlyReversalFormations(rows('W', true), 'BTCUSDT')
    .filter(c => c.patternKey === 'double_bottom').length, 0);
});

test('do not show an early duplicate if the regular scanner already found that pattern', () => {
  const previouslyDetected = [{ patternKey: 'double_bottom' }] as DetectedFormation[];
  assert.equal(detectEarlyReversalFormations(rows('W'), 'BTCUSDT', previouslyDetected)
    .some(c => c.patternKey === 'double_bottom'), false);
});

test('early results respect exchange, timeframe, direction, search, volume and category filters', () => {
  const candidate = detectEarlyReversalFormations(rows('W'), 'BTCUSDT')
    .find(c => c.patternKey === 'double_bottom');
  assert.ok(candidate);
  const coin = {
    symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', exchange: 'binance',
    marketType: 'futures', currentPrice: 100, priceChange24h: -2, highPrice24h: 105,
    lowPrice24h: 95, volume24hUsd: 10_000_000, formations: [], earlyFormations: [candidate],
    timeframe: '15m', lastUpdated: 1, exchangeUrl: 'https://binance.com',
  } as ScannedCoin;
  const filters = {
    exchange: 'all', marketType: 'all', timeframe: '15m', category: 'all',
    bias: 'all', status: 'all', minVolumeUsd: 0, densityConfirmedOnly: false, roundNumberOnly: false,
    searchQuery: '', sortBy: 'confidence', sortOrder: 'desc',
  } as ScreenerFilterState;
  assert.equal(getVisibleEarlyFormations([coin], filters).length, 1);
  assert.equal(getVisibleEarlyFormations([coin], { ...filters, bias: 'bearish' }).length, 0);
  assert.equal(getVisibleEarlyFormations([coin], { ...filters, timeframe: '1h' }).length, 0);
  assert.equal(getVisibleEarlyFormations([coin], { ...filters, category: 'candlestick' }).length, 0);
  assert.equal(getVisibleEarlyFormations([coin], { ...filters, densityConfirmedOnly: true }).length, 0);
  assert.equal(getVisibleEarlyFormations([coin], { ...filters, roundNumberOnly: true }).length, 0);
});

test('Risk/reward is computed separately from early-zone worst fill and breakout-specific stop', () => {
  const long = evaluateEarlyTradePlans('bullish', 100, 102, 96, 110, 111, 108, 120);
  assert.deepEqual(long, { earlyRiskReward: 2.87, breakoutRiskReward: 2.72 });
  const short = evaluateEarlyTradePlans('bearish', 108, 110, 114, 100, 99, 102, 90);
  assert.deepEqual(short, { earlyRiskReward: 2.86, breakoutRiskReward: 2.75 });
});

test('Reject inverted SL/TP, stops on wrong side, out-of-sequence and nonpositive trade levels', () => {
  const base = ['bullish', 100, 102, 96, 110, 111, 108, 120] as const;
  assert.equal(evaluateEarlyTradePlans(base[0], 100, 102, 101, 110, 111, 108, 120), null);
  assert.equal(evaluateEarlyTradePlans(base[0], 100, 102, 96, 110, 111, 112, 120), null);
  assert.equal(evaluateEarlyTradePlans(base[0], 100, 112, 96, 110, 111, 108, 120), null);
  assert.equal(evaluateEarlyTradePlans(base[0], 100, 102, 96, 110, 121, 108, 120), null);
  assert.equal(evaluateEarlyTradePlans(base[0], 100, 102, 96, 110, 111, 108, -1), null);
  assert.equal(evaluateEarlyTradePlans('bearish', 108, 110, 109, 100, 99, 102, 90), null);
  assert.equal(evaluateEarlyTradePlans('bearish', 108, 110, 114, 100, 99, 98, 90), null);
  assert.equal(evaluateEarlyTradePlans('bearish', 108, 110, 114, 100, 89, 102, 90), null);
});

test('early preview level buttons independently toggle matching line IDs, across any timeframe', () => {
  const candidate = detectEarlyReversalFormations(rows('W'), 'BTCUSDT')
    .find(c => c.patternKey === 'double_bottom');
  assert.ok(candidate);
  const markers = earlyFormationChartMarkers(candidate);
  const defaults = defaultEarlyFormationLevelVisibility();
  assert.equal(filterEarlyFormationChartMarkers(markers, candidate, defaults).length, 7);

  const withoutEarly = filterEarlyFormationChartMarkers(markers, candidate, { ...defaults, earlyEntry: false });
  assert.equal(withoutEarly.length, 5);
  assert.ok(withoutEarly.every(m => !m.id.endsWith('-early-min') && !m.id.endsWith('-early-max')));
  assert.ok(withoutEarly.some(m => m.id.endsWith('-trigger')));

  const withoutBreakoutStop = filterEarlyFormationChartMarkers(markers, candidate, { ...defaults, breakoutStop: false });
  assert.equal(withoutBreakoutStop.length, 6);
  assert.ok(!withoutBreakoutStop.some(m => m.id.endsWith('-breakout-stop')));
  assert.ok(withoutBreakoutStop.some(m => m.id.endsWith('-stop')));

  const everythingOff = Object.fromEntries(Object.keys(defaults).map(key => [key, false])) as typeof defaults;
  assert.deepEqual(filterEarlyFormationChartMarkers(markers, candidate, everythingOff), []);
  assert.deepEqual(filterEarlyFormationChartMarkers(markers, candidate, defaults), markers);
});


test('W/M rejects gapped, duplicate and physically impossible candles instead of stitching them', () => {
  const complete = rows('W');
  const now = (complete.at(-1)!.time + 300) * 1000;
  assert.equal(prepareEarlyFormationCandles(complete, '5m', now)?.length, 60);
  for (const broken of [
    complete.filter((_, i) => i !== 6),
    [...complete.slice(0, 6), complete[5], ...complete.slice(6)],
    complete.map((bar, i) => i === 6 ? { ...bar, high: bar.close - .01 } : bar),
    complete.map((bar, i) => i === 6 ? { ...bar, volume: -1 } : bar),
    complete.map((bar, i) => i === 6 ? { ...bar, low: bar.close + .01 } : bar),
  ]) {
    assert.equal(prepareEarlyFormationCandles(broken, '5m', now), null);
    assert.deepEqual(detectEarlyReversalFormations(broken, 'BTCUSDT', [], now), []);
  }
});

test('browser fallback uses only recently CLOSED candles from the selected market timeframe', () => {
  const complete = rows('W');
  const last = complete.at(-1)!;
  const duringCurrentBar = (last.time + 150) * 1000;
  assert.equal(prepareEarlyFormationCandles(complete, '5m', duringCurrentBar, true)?.length, 59);
  assert.equal(prepareEarlyFormationCandles(complete, '15m', duringCurrentBar, true), null);
  assert.equal(prepareEarlyFormationCandles(complete, '5m', (last.time + 300 + 300 + 91) * 1000, true), null);
});

test('prior trend is required: a flat lead-in cannot be presented as a reversal W', () => {
  const sidewaysLead = rows('W').map((bar, i) => {
    if (i >= 19) return bar;
    const close = 100 + (19 - i) * .02;
    return { ...bar, open: close, high: close + .15, low: close - .15, close };
  });
  assert.equal(detectEarlyReversalFormations(sidewaysLead, 'BTCUSDT')
    .filter(candidate => candidate.patternKey === 'double_bottom').length, 0);
});

test('unrounded net risk-reward gates reject ratios just below the thresholds', () => {
  // Previous implementation rounded 0.996 to 1.00 and 0.798 to 0.80.
  assert.equal(evaluateEarlyTradePlans('bullish', 100, 102, 90, 110, 111, 108, 113.952, 0), null);
  assert.equal(evaluateEarlyTradePlans('bullish', 100, 102, 99, 110, 111, 108, 113.394, 0), null);
  assert.ok(evaluateEarlyTradePlans('bullish', 100, 102, 96, 110, 111, 108, 120, 0));
  const gross = evaluateEarlyTradePlans('bullish', 100, 102, 96, 110, 111, 108, 120, 0);
  const costAdjusted = evaluateEarlyTradePlans('bullish', 100, 102, 96, 110, 111, 108, 120);
  assert.ok(gross && costAdjusted);
  assert.ok(costAdjusted.earlyRiskReward < gross.earlyRiskReward);
  assert.ok(costAdjusted.breakoutRiskReward < gross.breakoutRiskReward);
});

test('exchange tick quantization is directional and recalculates net R:R', () => {
  for (const shape of ['W', 'M'] as const) {
    const candidate = detectEarlyReversalFormations(rows(shape), shape === 'W' ? 'BTCUSDT' : 'ETHUSDT')[0];
    assert.ok(candidate);
    const aligned = alignEarlyFormationToTick(candidate, .01);
    assert.ok(aligned);
    assert.equal(aligned.tickVerified, true);
    for (const p of [aligned.firstPivot, aligned.neckline, aligned.earlyEntryMin,
      aligned.earlyEntryMax, aligned.breakoutEntry, aligned.stopLoss,
      aligned.breakoutStopLoss, aligned.target]) {
      assert.ok(Math.abs(p / .01 - Math.round(p / .01)) < 1e-7, `Not tick aligned: ${p}`);
    }
    assert.ok(aligned.earlyRiskReward >= 1);
    assert.ok(aligned.breakoutRiskReward >= .8);
    assert.equal(alignEarlyFormationToTick(candidate, null)?.tickVerified, false);
    assert.equal(alignEarlyFormationToTick(candidate, 100), null);
  }
});

test('forming-only filter hides potential early scenarios', () => {
  const forming = detectEarlyReversalFormations(rows('W'), 'BTCUSDT')[0];
  assert.ok(forming);
  const potential = { ...forming, id: 'potential-id', stage: 'potential' as const };
  const coin = {
    symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', exchange: 'binance',
    marketType: 'futures', currentPrice: 100, priceChange24h: 0, highPrice24h: 110,
    lowPrice24h: 95, volume24hUsd: 1_000_000, formations: [], earlyFormations: [forming, potential],
    timeframe: '5m', lastUpdated: 1, exchangeUrl: '',
  } as ScannedCoin;
  const filters = {
    exchange: 'all', marketType: 'all', timeframe: '5m', category: 'all',
    bias: 'all', status: 'forming', minVolumeUsd: 0, densityConfirmedOnly: false, roundNumberOnly: false,
    searchQuery: '', sortBy: 'confidence', sortOrder: 'desc',
  } as ScreenerFilterState;
  assert.deepEqual(getVisibleEarlyFormations([coin], filters).map(x => x.candidate.id), [forming.id]);
  assert.equal(getVisibleEarlyFormations([coin], { ...filters, status: 'all' }).length, 2);
});

test('open early chart refreshes projections from current scan and invalidates missing setups', () => {
  const candidate = detectEarlyReversalFormations(rows('W'), 'BTCUSDT')[0];
  assert.ok(candidate);
  const original = {
    symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', exchange: 'binance',
    marketType: 'futures', currentPrice: 100, priceChange24h: 0, highPrice24h: 110,
    lowPrice24h: 95, volume24hUsd: 1_000_000, formations: [], earlyFormations: [candidate],
    timeframe: '5m', lastUpdated: 1, exchangeUrl: '',
  } as ScannedCoin;
  const selection = { coin: original, candidate };
  const changed = { ...candidate, earlyEntryMin: candidate.earlyEntryMin * 1.0001 };
  const revisedCoin = { ...original, earlyFormations: [changed] };
  assert.equal(findCurrentEarlyFormation(selection, [revisedCoin])?.candidate, changed);
  assert.equal(findCurrentEarlyFormation(selection, [{ ...original, earlyFormations: [] }]), null);
  assert.equal(findCurrentEarlyFormation(selection, [{ ...original, timeframe: '15m' }]), null);
  assert.equal(findCurrentEarlyFormation(selection, [{ ...original, exchange: 'bybit' }]), null);
});

test('direct fallback chooses highest-volume markets across both exchanges, not only Binance', () => {
  const make = (exchange: 'binance' | 'bybit', volume: number, id: number) =>
    ({ exchange, marketType: 'futures', symbol: `COIN${id}USDT`, volumeUsd: volume }) as MarketCoin;
  const binance = Array.from({ length: 45 }, (_, i) => make('binance', 1_000_000 - i, i));
  const bybit = Array.from({ length: 45 }, (_, i) => make('bybit', 2_000_000 - i, i));
  const selection = selectDirectEarlyScanCandidates([...binance, ...bybit], 30);
  assert.equal(selection.length, 30);
  assert.ok(selection.every(item => item.exchange === 'bybit'));
  assert.equal(selectDirectEarlyScanCandidates([...binance, ...bybit]).length, 60);
});


test('early W/M filters are independent and remove hidden regular-only blockers', () => {
  const regular: ScreenerFilterState = {
    exchange: 'bybit', marketType: 'spot', timeframe: '1h',
    category: 'candlestick', bias: 'bearish', status: 'breakout',
    densityConfirmedOnly: true, roundNumberOnly: true, minVolumeUsd: 100_000,
    searchQuery: 'ETH', sortBy: 'volume', sortOrder: 'asc',
  };
  const snapshot = JSON.stringify(regular);
  const early = createEarlyModeFilters(regular);
  assert.notStrictEqual(early, regular);
  assert.equal(JSON.stringify(regular), snapshot, 'entering early mode never changes standard filters');
  assert.equal(early.category, 'all');
  assert.equal(early.status, 'all');
  assert.equal(early.densityConfirmedOnly, false);
  assert.equal(early.roundNumberOnly, false);
  assert.equal(early.exchange, 'bybit');
  assert.equal(early.marketType, 'spot');
  assert.equal(early.timeframe, '1h');
  assert.equal(early.searchQuery, 'ETH');
  assert.equal(early.bias, 'bearish');
  early.exchange = 'binance';
  early.bias = 'bullish';
  early.searchQuery = 'BTC';
  assert.equal(JSON.stringify(regular), snapshot,
    'editing early settings does not overwrite previously chosen standard settings');
});

test('dedicated W/M stage selects potential, forming or both without restarting the scan', () => {
  const w = detectEarlyReversalFormations(rows('W'), 'BTCUSDT')[0];
  const m = detectEarlyReversalFormations(rows('M'), 'ETHUSDT')[0];
  assert.ok(w);
  assert.ok(m);
  const potential = { ...w, id: 'potential-only', stage: 'potential' as const };
  const btc: ScannedCoin = {
    symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', exchange: 'binance',
    marketType: 'futures', currentPrice: 100, priceChange24h: 0, highPrice24h: 110,
    lowPrice24h: 95, volume24hUsd: 1_000_000, formations: [], earlyFormations: [w, potential],
    timeframe: '5m', lastUpdated: 1, exchangeUrl: '',
  };
  const eth: ScannedCoin = {
    ...btc, symbol: 'ETHUSDT', baseAsset: 'ETH', earlyFormations: [m],
  };
  const settings: ScreenerFilterState = {
    exchange: 'all', marketType: 'all', timeframe: '5m',
    category: 'all', bias: 'all', status: 'all', minVolumeUsd: 0,
    densityConfirmedOnly: false, roundNumberOnly: false, searchQuery: '',
    sortBy: 'confidence', sortOrder: 'desc',
  };
  const pool = [btc, eth];
  assert.equal(getVisibleEarlyFormations(pool, settings, 'all').length, 3);
  assert.deepEqual(getVisibleEarlyFormations(pool, settings, 'potential').map(row => row.candidate.id), [potential.id]);
  assert.equal(getVisibleEarlyFormations(pool, settings, 'forming').length, 2);
  assert.equal(getVisibleEarlyFormations(pool, { ...settings, bias: 'bullish' }, 'forming').length, 1);
  assert.equal(getVisibleEarlyFormations(pool, { ...settings, bias: 'bearish' }, 'forming').length, 1);
  assert.equal(getVisibleEarlyFormations(pool, { ...settings, searchQuery: 'ETH' }, 'all').length, 1);
  assert.equal(getVisibleEarlyFormations(pool, { ...settings, exchange: 'bybit' }, 'all').length, 0);
  assert.equal(getVisibleEarlyFormations(pool, { ...settings, minVolumeUsd: 2_000_000 }, 'all').length, 0);
});
