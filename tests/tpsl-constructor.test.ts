import test from 'node:test';
import assert from 'node:assert/strict';
import type { DetectedFormation, Kline, ScannedCoin } from '../src/types';
import { earlyFormationChartMarkers, type EarlyFormationCandidate } from '../src/utils/earlyFormations';
import {
  TP_SL_DEFAULT_RULE, TP_SL_DISABLED, countWickTouches, normalizeTpSlRule,
  applyClosedEarlyWickTouch, getTpSlRule, normalizeTpSlSettings, projectUserCoins,
  resolveEarlyTpSl, resolveFormationTpSl, sampleWickTouches, serializeTpSlSettings,
  tpSlCoinRuleKey, type TpSlConstructorSettings, type WickTouchBar,
} from '../src/utils/tpSlConstructor';

const base: DetectedFormation = {
  id: 'BTC-double-bottom-1', patternKey: 'double_bottom', name: 'W', nameEn: 'W',
  category: 'reversal', bias: 'bullish', confidence: 75, status: 'forming',
  statusLabel: 'Формується', description: '', detectedAt: 1,
  levels: { entryPrice: 100, targetPrice: 110, stopLossPrice: 95, supportPrice: 95 },
  riskRewardRatio: 2, potentialProfitPct: 10, potentialRiskPct: 5,
  validation: { atrPct: 2 } as DetectedFormation['validation'],
  wickTouchBars: [
    [10, 95, 96],
    [11, 95.1, 97],
    [15, 95, 97],
  ],
};
const coin = {
  symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', exchange: 'binance', marketType: 'futures',
  currentPrice: 99, priceChange24h: 0, highPrice24h: 101, lowPrice24h: 94,
  volume24hUsd: 10_000_000, formations: [base], timeframe: '1h', lastUpdated: 1,
  exchangeUrl: '',
} as ScannedCoin;
const settings: TpSlConstructorSettings = {
  version: 1, enabled: true,
  rules: { double_bottom: { ...TP_SL_DEFAULT_RULE, customLevelsEnabled: true, entryAtrOffset: .5,
    stopAtrBuffer: .5, targetRiskReward: 2, requireRejection: true, minTouchGap: 3 } },
};

test('default/disabled path is reference-identical: no scans, copies or revalidation', () => {
  assert.equal(resolveFormationTpSl(base), base);
  assert.equal(resolveFormationTpSl(base, TP_SL_DISABLED), base);
  assert.equal(resolveFormationTpSl(base, { ...settings, enabled: false }), base);
  assert.equal(projectUserCoins([coin], { ...settings, enabled: false })[0], coin);
  assert.equal(projectUserCoins([coin], TP_SL_DISABLED)[0].formations[0], base);
});

test('user A custom levels never mutate the shared cached formation or user B', () => {
  const original = structuredClone(coin);
  const customized = projectUserCoins([coin], settings);
  assert.notEqual(customized[0], coin);
  assert.deepEqual(coin, original);
  assert.equal(customized[0].formations[0].levels.entryPrice, 101);
  assert.equal(customized[0].formations[0].levels.stopLossPrice, 94);
  assert.equal(customized[0].formations[0].levels.targetPrice, 115);
  assert.equal(customized[0].formations[0].riskRewardRatio, 2);
  assert.equal(customized[0].formations[0].confidence, base.confidence);
  assert.equal(projectUserCoins([coin], TP_SL_DISABLED)[0], coin);
});

test('touches use candle wicks, not open/close bodies, and prevent adjacent duplicate contacts', () => {
  const data: Kline[] = Array.from({ length: 14 }, (_, i) => ({
    time: 1_700_000_000 + i * 60,
    open: 100, close: 100.4, high: 102, low: 99, volume: 1,
  }));
  data[2].low = 95;
  data[3].low = 95.1; // same encounter
  data[7].low = 94.9;
  data[8].low = 95.05; // same encounter
  data[12].low = 95.0;
  const samples = sampleWickTouches(data, 0, 95, 'low');
  const rule = normalizeTpSlRule({ ...TP_SL_DEFAULT_RULE, touchTolerancePct: .3, minTouchGap: 3 });
  assert.equal(countWickTouches(samples, 95, 'low', rule), 3);
  assert.equal(countWickTouches(samples, 95, 'low', { ...rule, minTouchGap: 6 }), 2);
  assert.ok(samples.every(row => row[1] < row[2]));
});

test('missing HIGH/LOW evidence never permits an entry by accident', () => {
  const noSupport = {
    ...base, levels: { entryPrice: 100, targetPrice: 110, stopLossPrice: 95 },
    wickTouchBars: undefined,
  };
  const projected = resolveFormationTpSl(noSupport, settings);
  assert.equal(projected.tpSlBuilder?.touches?.verified, false);
  assert.equal(projected.tpSlBuilder?.touches?.ready, false);
  assert.equal(projected.tpSlBuilder?.touches?.count, 0);
  const noBars = resolveFormationTpSl({ ...base, wickTouchBars: undefined }, settings);
  assert.equal(noBars.tpSlBuilder?.touches?.verified, false);
  assert.equal(noBars.tpSlBuilder?.touches?.ready, false);
  assert.equal(resolveFormationTpSl(noSupport, TP_SL_DISABLED), noSupport);
});

test('touch-only rule never alters original level prices or R:R', () => {
  const touchOnly = {
    ...settings, rules: { double_bottom: { ...settings.rules.double_bottom,
      customLevelsEnabled: false, lowTouches: 3 } },
  };
  const projected = resolveFormationTpSl(base, touchOnly);
  assert.deepEqual(projected.levels, base.levels);
  assert.equal(projected.riskRewardRatio, base.riskRewardRatio);
  assert.equal(projected.tpSlBuilder?.touches?.count, 2);
  assert.equal(projected.tpSlBuilder?.touches?.ready, false);
});

test('no configured patterns retain the old reference even when global enabled', () => {
  assert.equal(projectUserCoins([coin], { version: 1, enabled: true, rules: {} })[0], coin);
});

test('consecutive candles touching the same wick zone count as one visit', () => {
  const bars: WickTouchBar[] = Array.from({ length: 10 }, (_, index) => [
    index, 95 + (index % 2) * .05, 96,
  ]);
  const rule = { ...TP_SL_DEFAULT_RULE, lowTouches: 3, minTouchGap: 3 };
  assert.equal(countWickTouches(bars, 95, 'low', rule), 1);
  // A new visit begins only after price leaves the tolerance zone.
  bars.push([15, 95, 96]);
  assert.equal(countWickTouches(bars, 95, 'low', rule), 2);
  bars.push([16, 95.05, 96]);
  assert.equal(countWickTouches(bars, 95, 'low', rule), 2);
});

test('an overly quick second visit cannot become valid by lingering inside the zone', () => {
  const bars: WickTouchBar[] = [
    [2, 95, 96], // accepted first
    [4, 95, 96], // new visit begins too soon (minimum gap = 3)
    [5, 95, 96],
    [6, 95, 96], // still the same invalid second visit
    [10, 95, 96], // distinct third visit after leaving the zone
  ];
  assert.equal(countWickTouches(bars, 95, 'low', TP_SL_DEFAULT_RULE), 2);
});

test('non-finite values are normalized, free price offsets are not clipped, wick controls stay bounded', () => {
  const bad = normalizeTpSlRule({ ...TP_SL_DEFAULT_RULE,
    entryAtrOffset: 999, stopAtrBuffer: -99, lowTouches: 500,
    targetRiskReward: Number.NaN, touchTolerancePct: 20,
  });
  assert.equal(bad.entryAtrOffset, 999);
  assert.equal(bad.stopAtrBuffer, -99);
  assert.equal(bad.lowTouches, 6);
  assert.equal(bad.targetRiskReward, 2);
  assert.equal(bad.touchTolerancePct, 2);
});

test('late rejection counts same visit at most once', () => {
  const bars: WickTouchBar[] = [
    [1, 95, 95],
    [2, 95.1, 96],
    [3, 95, 97],
  ];
  assert.equal(countWickTouches(bars, 95, 'low', TP_SL_DEFAULT_RULE), 1);
});

test('configured wick gate is provisional and never changes the original scan confidence', () => {
  const projected = resolveFormationTpSl(base, {
    ...settings, rules: { double_bottom: { ...settings.rules.double_bottom, lowTouches: 3 } },
  });
  assert.equal(projected.tpSlBuilder?.touches?.ready, false);
  assert.equal(projected.tpSlBuilder?.touches?.count, 2);
  assert.equal(projected.confidence, base.confidence);
  assert.equal(base.tpSlBuilder, undefined);
});

test('early W stays an unconfirmed candidate; invalid projected geometry falls back safely', () => {
  const early: EarlyFormationCandidate = {
    id: 'W-1', patternKey: 'double_bottom', name: 'W', bias: 'bullish', stage: 'forming',
    firstPivot: 95, neckline: 104, earlyEntryMin: 94.68, earlyEntryMax: 96.4,
    breakoutEntry: 104.24, stopLoss: 93, breakoutStopLoss: 101.5, target: 113,
    earlyRiskReward: 8, breakoutRiskReward: 2, observedAt: 1, explanation: 'potential',
    wickTouchBars: base.wickTouchBars,
  };
  assert.equal(resolveEarlyTpSl(early, TP_SL_DISABLED), early);
  const configured = resolveEarlyTpSl(early, settings);
  assert.equal(configured.stage, 'forming');
  assert.equal(configured.bias, 'bullish');
  assert.equal(configured.patternKey, 'double_bottom');
  assert.equal(early.earlyEntryMin, 94.68);
  assert.equal(configured.tpSlBuilder?.touches?.count, 2);
  assert.equal(configured.tpSlBuilder?.touches?.ready, true);
  assert.equal(configured.tpSlBuilder?.levelStatus, 'invalid');
  // Even a failed custom price projection must enforce the configured gate.
  const strict = resolveEarlyTpSl(early, { ...settings, rules: {
    double_bottom: { ...settings.rules.double_bottom, lowTouches: 3 },
  } });
  assert.equal(strict.tpSlBuilder?.touches?.ready, false);
  assert.equal(strict.earlyEntryMin, early.earlyEntryMin);

  const ticked = resolveEarlyTpSl({
    ...early, tickSize: .25, tickVerified: true,
  }, { ...settings, rules: {
    double_bottom: { ...settings.rules.double_bottom, targetRiskReward: 5 },
  } });
  assert.equal(ticked.tpSlBuilder?.levelStatus, 'applied');
  for (const value of [ticked.earlyEntryMin, ticked.earlyEntryMax,
    ticked.breakoutEntry, ticked.stopLoss, ticked.breakoutStopLoss, ticked.target]) {
    assert.ok(Math.abs(value / .25 - Math.round(value / .25)) < 1e-8,
      `Price ${value} is not aligned to tick size`);
  }
});

test('SHORT contacts are measured at the HIGH wick, not the candle body', () => {
  const candles: Kline[] = Array.from({ length: 12 }, (_, i) => ({
    time: 1_700_000_000 + i * 60,
    open: 100, high: 101, low: 98, close: 99, volume: 10,
  }));
  candles[2].high = 105;
  candles[3].high = 104.9; // one contiguous visit
  candles[9].high = 105.1;
  const samples = sampleWickTouches(candles, 0, 105, 'high');
  assert.deepEqual(samples.map(x => x[0]), [2, 3, 9]);
  assert.equal(countWickTouches(samples, 105, 'high', TP_SL_DEFAULT_RULE), 2);
  assert.ok(samples.every(x => x[1] > x[2]));
});

test('an OPEN early chart counts the next CLOSED candle without new scans or a socket', () => {
  const lastTime = 1_700_000_000;
  const raw: EarlyFormationCandidate = {
    id: 'W-live', patternKey: 'double_bottom', name: 'Potential W',
    bias: 'bullish', stage: 'potential', firstPivot: 95, neckline: 104,
    earlyEntryMin: 94.6, earlyEntryMax: 96,
    breakoutEntry: 104.3, breakoutStopLoss: 100, stopLoss: 93,
    target: 112, earlyRiskReward: 4, breakoutRiskReward: 2,
    observedAt: lastTime, explanation: 'candidate',
    wickSnapshotEndIndex: 64,
    wickTouchBars: [[54, 95, 96], [59, 95.1, 96]],
  };
  const rule = { ...TP_SL_DEFAULT_RULE, lowTouches: 3, customLevelsEnabled: false };
  const original = resolveEarlyTpSl(raw, { version: 1, enabled: true,
    rules: { double_bottom: rule } });
  assert.equal(original.tpSlBuilder?.touches.count, 2);
  assert.equal(original.tpSlBuilder?.touches.ready, false);
  const hidden = earlyFormationChartMarkers(original);
  assert.ok(!hidden.some(marker => marker.type === 'entry' || marker.id.endsWith('-trigger')));
  const closed: Kline = {
    time: lastTime + 3_600, open: 97, high: 100, low: 95.05,
    close: 96, volume: 10,
  };
  const next = applyClosedEarlyWickTouch(original, closed, '1h', rule);
  assert.equal(next.tpSlBuilder?.touches.count, 3);
  assert.equal(next.tpSlBuilder?.touches.ready, true);
  assert.equal(next.stage, 'potential'); // touch condition != confirmed breakout
  assert.equal(raw.wickTouchBars?.length, 2); // never mutate server snapshot
  assert.equal(next.wickTouchBars?.length, 3);
  assert.equal(applyClosedEarlyWickTouch(next, closed, '1h', rule), next); // deduplicated
  assert.equal(applyClosedEarlyWickTouch(next, { ...closed, time: lastTime - 3_600 }, '1h', rule), next);
  const visible = earlyFormationChartMarkers(next);
  assert.equal(visible.filter(marker => marker.type === 'entry').length, 2);
  assert.ok(visible.some(marker => marker.id.endsWith('-trigger')));
});

test('an early preview does not count a live or incomplete candle time', () => {
  const lastTime = 1_700_000_000;
  const rule = { ...TP_SL_DEFAULT_RULE, lowTouches: 2, customLevelsEnabled: false };
  const original: EarlyFormationCandidate = {
    id: 'W-clock', patternKey: 'double_bottom', name: 'W',
    bias: 'bullish', stage: 'potential', firstPivot: 95, neckline: 104,
    earlyEntryMin: 94.6, earlyEntryMax: 96,
    breakoutEntry: 104.3, breakoutStopLoss: 100, stopLoss: 93,
    target: 112, earlyRiskReward: 4, breakoutRiskReward: 2,
    observedAt: lastTime, explanation: '',
    wickSnapshotEndIndex: 64, wickTouchBars: [[58,95,96]],
  };
  const projected = resolveEarlyTpSl(original, { version: 1, enabled: true,
    rules: { double_bottom: rule } });
  const partial: Kline = { time: lastTime + 90, open: 96, high: 98, low: 95,
    close: 96, volume: 1 };
  assert.equal(applyClosedEarlyWickTouch(projected, partial, '1h', rule), projected);
  assert.equal(projected.tpSlBuilder?.touches.ready, false);
});

test('coin+pattern overrides take precedence without touching other pairs or global rules', () => {
  const eth = { ...coin, symbol: 'ETHUSDT', baseAsset: 'ETH',
    formations: [base], bestFormation: base } as ScannedCoin;
  const isolated: TpSlConstructorSettings = {
    version: 1, enabled: true, rules: {},
    coinRules: { BTCUSDT__double_bottom: {
      ...TP_SL_DEFAULT_RULE, customLevelsEnabled: true,
      entryAtrOffset: 3.75, stopAtrBuffer: 0, targetAtrOffset: 12.5,
    } },
  };
  const projected = projectUserCoins([coin, eth], isolated);
  assert.notEqual(projected[0], coin);
  assert.equal(projected[0].formations[0].levels.entryPrice, 107.5);
  assert.equal(projected[0].formations[0].levels.stopLossPrice, 95);
  assert.equal(projected[0].formations[0].levels.targetPrice, 135);
  assert.equal(projected[1], eth); // no global template, untouched same W on ETH
  assert.equal(projected[0].formations[0].tpSlBuilder?.levelStatus, 'applied');

  const both: TpSlConstructorSettings = {
    ...isolated, rules: { double_bottom: {
      ...TP_SL_DEFAULT_RULE, customLevelsEnabled: true, entryAtrOffset: -0.5,
      stopAtrBuffer: 0, targetRiskReward: 3,
    } },
  };
  const withGlobal = projectUserCoins([coin, eth], both);
  assert.equal(withGlobal[0].formations[0].levels.targetPrice, 135); // BTC override
  assert.equal(withGlobal[1].formations[0].levels.entryPrice, 99); // ETH fallback
  assert.equal(withGlobal[1].formations[0].levels.targetPrice, 111); // 99 + (99-95) * 3
  assert.equal(withGlobal[1].bestFormation?.levels.entryPrice, 99);
  assert.equal(base.levels.entryPrice, 100);
  assert.equal(resolveFormationTpSl(base, both, 'XRPUSDT').levels.entryPrice, 99);
  assert.equal(resolveFormationTpSl(base, both, 'BTCUSDT').levels.entryPrice, 107.5);
  assert.equal(tpSlCoinRuleKey(' btcusdt ', 'double_bottom'), 'BTCUSDT__double_bottom');
  assert.equal(tpSlCoinRuleKey('../BTCUSDT', 'double_bottom'), null);
  assert.equal(getTpSlRule({ ...both, enabled: false }, 'BTCUSDT', 'double_bottom'), undefined);
});

test('Firestore v1 stores per-coin rules under nested rules._coins, without new top-level keys', () => {
  const original: TpSlConstructorSettings = {
    version: 1, enabled: true,
    rules: { double_top: { ...TP_SL_DEFAULT_RULE, lowTouches: 4 } },
    coinRules: {
      BTCUSDT__double_bottom: { ...TP_SL_DEFAULT_RULE, customLevelsEnabled: true, targetAtrOffset: 99 },
      ETHUSDT__double_bottom: { ...TP_SL_DEFAULT_RULE, customLevelsEnabled: false, highTouches: 3 },
    },
  };
  const stored = serializeTpSlSettings(original);
  assert.deepEqual(Object.keys(stored).sort(), ['enabled', 'rules', 'version']);
  assert.equal(Object.keys(stored.rules).length, 2);
  assert.equal((stored.rules as unknown as Record<string, unknown>)._coins !== undefined, true);
  assert.equal(Object.prototype.hasOwnProperty.call(original.rules, '_coins'), false);
  const hydrated = normalizeTpSlSettings(JSON.parse(JSON.stringify(stored)) as TpSlConstructorSettings);
  assert.deepEqual(hydrated, normalizeTpSlSettings(original));
  assert.deepEqual(normalizeTpSlSettings(serializeTpSlSettings(hydrated)), hydrated);
  const disabled = projectUserCoins([coin], { ...hydrated, enabled: false });
  assert.equal(disabled[0], coin);
  const noOverrides = { ...hydrated, coinRules: undefined };
  assert.equal(getTpSlRule(noOverrides, 'BTCUSDT', 'double_bottom'), undefined);

  const malicious = normalizeTpSlSettings({
    version: 1, enabled: true, rules: {
      arbitrary: TP_SL_DEFAULT_RULE,
      _coins: {
        'BTCUSDT__double_bottom': { ...TP_SL_DEFAULT_RULE, lowTouches: 4 },
        'BAD/SYMBOL__double_bottom': TP_SL_DEFAULT_RULE,
      },
    } as unknown as Record<string, typeof TP_SL_DEFAULT_RULE>,
  });
  assert.equal(malicious.rules.arbitrary, undefined);
  assert.equal(Object.keys(malicious.coinRules || {}).length, 1);
  assert.equal(malicious.coinRules?.BTCUSDT__double_bottom.lowTouches, 4);
});

test('unbounded price inputs preserve large ATR moves; TP remains independent of SL and Entry', () => {
  const rule = normalizeTpSlRule({
    ...TP_SL_DEFAULT_RULE, entryAtrOffset: 35, stopAtrBuffer: 18,
    targetRiskReward: 75, targetAtrOffset: 250,
  });
  assert.equal(rule.entryAtrOffset, 35);
  assert.equal(rule.stopAtrBuffer, 18);
  assert.equal(rule.targetRiskReward, 75);
  assert.equal(rule.targetAtrOffset, 250);
  const entryRule: TpSlConstructorSettings = { version: 1, enabled: true, rules: {
    double_bottom: {
      ...TP_SL_DEFAULT_RULE, customLevelsEnabled: true,
      entryAtrOffset: 0.5, stopAtrBuffer: 0, targetAtrOffset: 6,
    },
  } };
  const first = resolveFormationTpSl(base, entryRule);
  assert.equal(first.levels.targetPrice, 122);
  const afterStop = resolveFormationTpSl(base, { ...entryRule, rules: { double_bottom: {
    ...entryRule.rules.double_bottom, entryAtrOffset: 1.5, stopAtrBuffer: 2,
  } } });
  assert.equal(afterStop.levels.targetPrice, 122);
  assert.notEqual(afterStop.levels.entryPrice, first.levels.entryPrice);
  assert.notEqual(afterStop.levels.stopLossPrice, first.levels.stopLossPrice);
  const invalid = resolveFormationTpSl(base, { ...entryRule, rules: {
    double_bottom: { ...entryRule.rules.double_bottom, stopAtrBuffer: -5 },
  } });
  assert.equal(invalid.tpSlBuilder?.levelStatus, 'invalid');
  assert.deepEqual(invalid.levels, base.levels); // never publishes inverted stop
  assert.equal(normalizeTpSlRule({ ...TP_SL_DEFAULT_RULE, targetAtrOffset: Number.NaN }).targetAtrOffset, undefined);
});

test('early W/M uses the coin-specific wick gate without changing the shared candidate', () => {
  const early: EarlyFormationCandidate = {
    id: 'early-btc-W', patternKey: 'double_bottom', name: 'W',
    bias: 'bullish', stage: 'potential', firstPivot: 95, neckline: 104,
    earlyEntryMin: 94.5, earlyEntryMax: 96, breakoutEntry: 104.5,
    stopLoss: 92, breakoutStopLoss: 101.5, target: 114,
    earlyRiskReward: 4, breakoutRiskReward: 2, observedAt: 1,
    explanation: 'in progress', wickTouchBars: base.wickTouchBars,
  };
  const perCoin: TpSlConstructorSettings = { version: 1, enabled: true,
    rules: { double_bottom: { ...TP_SL_DEFAULT_RULE, lowTouches: 2 } },
    coinRules: { BTCUSDT__double_bottom: { ...TP_SL_DEFAULT_RULE, lowTouches: 4 } },
  };
  const btc = resolveEarlyTpSl(early, perCoin, 'BTCUSDT');
  const eth = resolveEarlyTpSl(early, perCoin, 'ETHUSDT');
  assert.equal(btc.tpSlBuilder?.touches.required, 4);
  assert.equal(btc.tpSlBuilder?.touches.ready, false);
  assert.equal(eth.tpSlBuilder?.touches.required, 2);
  assert.equal(eth.tpSlBuilder?.touches.ready, true);
  assert.equal(btc.stage, 'potential');
  assert.equal(early.tpSlBuilder, undefined);
  assert.equal(resolveEarlyTpSl(early, { ...perCoin, enabled: false }, 'BTCUSDT'), early);
});
