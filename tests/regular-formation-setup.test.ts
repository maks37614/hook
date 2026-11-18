import test from 'node:test';
import assert from 'node:assert/strict';
import type { DetectedFormation, Kline } from '../src/types';
import { formatCryptoPrice } from '../src/utils/formatters';
import { validateFormation } from '../src/utils/formationValidation';
import { refineRegularFormationSet, refineRegularFormationSetup } from '../src/utils/regularFormationSetup';
import { reassessRegularFormationQuality } from '../src/utils/regularFormationQuality';
import { inspectRegularRoundNumberDensity } from '../server/regularOrderbookDensity';
import { analyzeRoundNumber } from '../src/utils/roundNumber';
import { detectFormations, regularFormationCandidates } from '../src/utils/patternRecognition';
import { normalizeTpSlRule, resolveFormationTpSl } from '../src/utils/tpSlConstructor';

function bars(): Kline[] {
  return Array.from({ length: 65 }, (_, i) => {
    const close = 100 + Math.sin(i / 3.2) * .6 + Math.cos(i / 8) * .2;
    return {
      time: 1700000000 + i * 300,
      open: close, high: close + .35, low: close - .35, close,
      volume: 100,
    };
  });
}
function pattern(bias: 'bullish' | 'bearish', entry: number, stop: number, target: number): DetectedFormation {
  return {
    id: 'regular-flag-1',
    patternKey: bias === 'bullish' ? 'bull_flag' : 'bear_flag',
    name: bias === 'bullish' ? 'Бичачий прапор' : 'Ведмежий прапор',
    nameEn: bias === 'bullish' ? 'Bull Flag' : 'Bear Flag',
    category: 'continuation', bias, confidence: 65,
    status: 'forming', statusLabel: 'Очікування пробою',
    description: `Виміряна ціль $ ${formatCryptoPrice(target)}; raw $${formatCryptoPrice(target)}.`,
    levels: {
      entryPrice: entry, stopLossPrice: stop, targetPrice: target,
      supportPrice: 99.7, resistancePrice: 100.3,
    },
    riskRewardRatio: Math.abs(target - entry) / Math.abs(entry - stop),
    potentialProfitPct: Math.abs(target - entry) / entry * 100,
    potentialRiskPct: Math.abs(entry - stop) / entry * 100,
    detectedAt: 1700000000, candleStartIndex: 40,
    candleEndIndex: 64, structureEndIndex: 55,
  };
}

test('standard bearish flag caps oversized take-profit without moving it farther away', () => {
  const source = pattern('bearish', 100, 103, 85);
  const result = refineRegularFormationSet(bars(), [source])[0];
  assert.ok(result.levels.targetPrice < 100 && result.levels.targetPrice > 85);
  assert.ok((100 - result.levels.targetPrice) < 3);
  assert.equal(result.validation?.targetPrice, result.levels.targetPrice);
  assert.equal(result.validation?.stopPrice, result.levels.stopLossPrice);
  assert.equal(result.validation?.riskReward, result.riskRewardRatio);
  assert.ok(result.riskRewardRatio < source.riskRewardRatio);
  assert.ok(result.validation?.confluence);
  assert.equal(result.confidence, Math.round(result.validation.confluence.total));
  assert.ok((result.regularSetupAdjustment?.reasons.length ?? 0) >= 1);
  assert.ok(result.description.includes('$' + formatCryptoPrice(result.levels.targetPrice)));
  assert.ok(!result.description.includes('$' + formatCryptoPrice(source.levels.targetPrice)));
  assert.ok(!result.validation?.passed, 'low realistic R:R must not become a confirmed setup');
});

test('standard bullish targets are capped conservatively and stop stays behind structure', () => {
  const source = pattern('bullish', 100, 97, 115);
  const candles = bars();
  const result = refineRegularFormationSet(candles, [source])[0];
  assert.ok(result.levels.targetPrice > 100 && result.levels.targetPrice < 115);
  const retest = result.validation?.retestIndex;
  assert.ok(result.levels.stopLossPrice < (retest === undefined ? source.levels.supportPrice! : candles[retest].low));
  assert.ok(result.potentialProfitPct < 15);
  assert.ok(result.validation?.confluence?.components.riskReward.score !== undefined);
});

test('exchange price ticks round entry against trader and TP inward', () => {
  for (const bias of ['bullish', 'bearish'] as const) {
    const source = bias === 'bullish'
      ? pattern(bias, 100.03, 99, 110)
      : pattern(bias, 100.07, 101.2, 90);
    source.structureEndIndex = 64;
    const refined = refineRegularFormationSetup(bars(), source, .1);
    assert.ok(refined.levels.entryPrice > 0);
    assert.ok(Math.abs(refined.levels.entryPrice / .1 - Math.round(refined.levels.entryPrice / .1)) < 1e-8);
    assert.ok(Math.abs(refined.levels.targetPrice / .1 - Math.round(refined.levels.targetPrice / .1)) < 1e-8);
    assert.ok(Math.abs(refined.levels.stopLossPrice / .1 - Math.round(refined.levels.stopLossPrice / .1)) < 1e-8);
    if (bias === 'bullish') {
      assert.ok(refined.levels.entryPrice >= source.levels.entryPrice);
      assert.ok(refined.levels.targetPrice <= source.levels.targetPrice);
      assert.ok(refined.levels.stopLossPrice < source.levels.supportPrice!);
    } else {
      assert.ok(refined.levels.entryPrice <= source.levels.entryPrice);
      assert.ok(refined.levels.targetPrice >= source.levels.targetPrice);
      assert.ok(refined.levels.stopLossPrice > source.levels.resistancePrice!);
    }
  }
});

test('confluence volume uses actual breakout candle, not a high-volume last candle', () => {
  const candles = bars().map((bar, i) => {
    const close = i < 55 ? 101.2 : 99.4;
    return { ...bar, open: close, close, high: close + .35, low: close - .35,
      volume: i === 64 ? 2000 : 100 };
  });
  const raw = pattern('bearish', 100.5, 103, 96);
  raw.levels.supportPrice = 100.5;
  raw.structureEndIndex = 52;
  const v = validateFormation(candles, raw);
  assert.equal(v.validation?.breakoutConfirmed, true);
  assert.ok(v.validation && v.validation.volumeRatio > 10,
    'legacy validator incorrectly used latest 2000-volume candle');
  const improved = reassessRegularFormationQuality(candles, v);
  assert.ok(improved.validation);
  assert.ok(improved.validation.volumeRatio <= 1.1);
  assert.ok(improved.validation.confluence!.components.volume.score <= 3);
  assert.equal(improved.validation.filters.volume, false);
  assert.equal(improved.validation.passed, false);
});

test('retest checks the same support line that the bearish breakout used', () => {
  const candles = bars().map((bar, i) => {
    const close = i <= 54 ? 101.2 : i === 55 ? 99.3 : 99.6;
    return { ...bar, open: close, close, high: i === 57 ? 100.48 : close + .25,
      low: close - .25, volume: 200 };
  });
  const source = pattern('bearish', 99.5, 103, 94);
  source.levels.supportPrice = 100.5;
  source.structureEndIndex = 52;
  const before = validateFormation(candles, source);
  assert.equal(before.validation?.breakoutConfirmed, true);
  const after = reassessRegularFormationQuality(candles, before);
  assert.equal(after.validation?.confluence?.components.retest.score, 7);
  assert.equal(after.validation?.retestIndex, 57);
  assert.equal(after.levels.entryPrice, candles[57].close);
});

function orderbook() {
  return {
    bids: Array.from({ length: 20 }, (_, i): [number, number] =>
      i === 0 ? [100, 300] : [100 - i * .01, 10]),
    asks: Array.from({ length: 20 }, (_, i): [number, number] =>
      i === 0 ? [100, 300] : [100 + i * .01, 10]),
  };
}

test('round number density respects order side, notional and actual location', () => {
  const book = orderbook();
  const context = analyzeRoundNumber(bars(), 100);
  const long = inspectRegularRoundNumberDensity(book, context, 100, 'bullish').density;
  const short = inspectRegularRoundNumberDensity(book, context, 100, 'bearish').density;
  assert.equal(long?.side, 'BID');
  assert.equal(short?.side, 'ASK');
  assert.ok((long?.notionalUsd ?? 0) >= 5000);
  assert.deepEqual(inspectRegularRoundNumberDensity(book, context, 99, 'bullish'), { checked: false });
  assert.deepEqual(inspectRegularRoundNumberDensity(book, context, 101, 'bearish'), { checked: false });
  assert.deepEqual(inspectRegularRoundNumberDensity(book, context, 100, 'neutral'), { checked: false });
  assert.deepEqual(inspectRegularRoundNumberDensity({ bids: [], asks: book.asks }, context, 100, 'bullish'), { checked: false });
  const low = orderbook();
  low.bids[0] = [100, 30]; // $3k is too weak even if >6x median
  assert.deepEqual(inspectRegularRoundNumberDensity(low, context, 100, 'bullish'), { checked: true });
  const gold = { bids: book.bids.map(([price, quantity]): [number, number] => [price + 3800, quantity]), asks: book.asks };
  const goldRound = analyzeRoundNumber(bars(), 3900.1);
  assert.equal(goldRound.level, 3900);
  assert.equal(inspectRegularRoundNumberDensity(gold, goldRound, 3901, 'bullish').density?.level, 3900);
  assert.equal(inspectRegularRoundNumberDensity({ ...gold, bids: gold.bids.slice(1) }, goldRound, 3901, 'bullish').checked, false);
});

test('a breakout entry far behind the current price is not treated as an executable signal', () => {
  const candles = bars().map((bar, i) => {
    const close = i <= 54 ? 101.2 : i === 55 ? 99.3 : 95;
    return { ...bar, open: close, close, high: close + .2,
      low: close - .2, volume: i === 55 ? 350 : 100 };
  });
  const source = pattern('bearish', 100.5, 103, 90);
  source.levels.supportPrice = 100.5;
  source.structureEndIndex = 52;
  const validated = validateFormation(candles, source);
  assert.equal(validated.validation?.breakoutConfirmed, true);
  const assessed = reassessRegularFormationQuality(candles, validated);
  assert.equal(assessed.validation?.passed, false);
  assert.ok(assessed.validation?.rejectionReasons.some(reason => reason.includes('1.5 ATR')));
  assert.match(assessed.statusLabel, /очікування свіжого ретесту/u);
});

function setBar(candles: Kline[], index: number, high: number, low: number, close: number, volume = 100, open = close) {
  candles[index] = { ...candles[index], open, close, high, low, volume };
}

function regularPatterns(candles: Kline[]) {
  return refineRegularFormationSet(candles,
    regularFormationCandidates(candles, detectFormations(candles, 'FIXTURE'), 'FIXTURE', '5m', .01), .01);
}

test('a horizontal breakout keeps its original resistance, stable ID and retest entry', () => {
  const candles = bars().map(bar => ({ ...bar, high: 99.77, low: 99.33, open: 99.55, close: 99.55 }));
  setBar(candles, 36, 100, 99.43, 99.71);
  setBar(candles, 52, 100, 99.45, 99.76);
  setBar(candles, 56, 99.78, 98.93, 99.45);
  for (const i of [61, 62]) setBar(candles, i, 99.98, 99.71, 99.88);
  setBar(candles, 63, 100.29, 99.88, 100.09, 230);
  setBar(candles, 64, 100.24, 99.99, 100.14, 170);
  const initial = regularPatterns(candles.slice(0, -1)).find(f => f.patternKey === 'level_breakout');
  const after = regularPatterns(candles).find(f => f.patternKey === 'level_breakout');
  assert.ok(initial && after);
  assert.equal(initial.id, after.id);
  assert.equal(initial.levels.resistancePrice, 100);
  assert.equal(after.validation?.regularPlan?.triggerLevel, 100);
  assert.equal(after.validation?.entryMode, 'RETEST');
  assert.equal(after.validation?.breakoutIndex, 63);
  assert.equal(after.validation?.retestIndex, 64);
  assert.equal(after.levels.entryPrice, 100.14);
  assert.ok(after.levels.stopLossPrice < candles[64].low);
  assert.ok(after.riskRewardRatio >= 2);
  assert.equal(after.validation?.passed, true);
});

test('standard double bottoms cannot backdate a breakout before the confirming right-hand candles', () => {
  const candles = bars().map(bar => ({ ...bar, high: 100.9, low: 100.5, open: 100.7, close: 100.7 }));
  setBar(candles, 38, 100.2, 98, 99.4);
  setBar(candles, 46, 102.5, 101.1, 101.8);
  setBar(candles, 54, 100.3, 98.1, 99.5);
  for (let i = 55; i < candles.length; i++) setBar(candles, i, 102.95, 102.5, 102.7, 230);
  const found = regularPatterns(candles.slice(0, 58)).find(f => f.patternKey === 'double_bottom');
  assert.ok(found);
  assert.equal(found.structureKnownIndex, 57);
  assert.equal(found.validation?.breakoutConfirmed, false);
  assert.equal(found.validation?.breakoutIndex, undefined);
});

test('a closed candlestick pattern keeps its identity long enough to confirm on a later candle', () => {
  const candles = bars().map(bar => ({ ...bar, open: 100, high: 100.2, low: 99.8, close: 100 }));
  setBar(candles, 62, 101.2, 99.8, 100, 100, 101);
  setBar(candles, 63, 101.8, 99.6, 101.6, 250, 99.7);
  setBar(candles, 64, 102.2, 101.5, 102.1, 250, 101.6);
  const initial = regularPatterns(candles.slice(0, -1)).find(f => f.patternKey === 'bull_engulfing');
  const confirmed = regularPatterns(candles).find(f => f.patternKey === 'bull_engulfing');
  assert.ok(initial && confirmed);
  assert.equal(initial.id, confirmed.id);
  assert.equal(initial.validation?.breakoutConfirmed, false);
  assert.equal(confirmed.validation?.breakoutIndex, 64);
  assert.equal(confirmed.validation?.regularPlan?.triggerLevel, 101.8);
});

test('profile TP/SL changes revalidate the displayed plan and its structural score', () => {
  const candles = bars().map(bar => ({ ...bar, open: 99.4, high: 99.95, low: 99.0, close: 99.4 }));
  setBar(candles, 64, 100.25, 99.95, 100.10, 240);
  const source = pattern('bullish', 100, 99.2, 103);
  source.levels.resistancePrice = 100;
  source.structureEndIndex = 63;
  const automatic = reassessRegularFormationQuality(candles, source);
  assert.equal(automatic.validation?.passed, true);
  const custom = resolveFormationTpSl(automatic, { version: 1, enabled: true, rules: {
    bull_flag: normalizeTpSlRule({ customLevelsEnabled: true, targetRiskReward: 1.1 }),
  } }, 'FIXTURE');
  assert.equal(custom.validation?.passed, false);
  assert.equal(custom.validation?.riskReward, custom.riskRewardRatio);
  assert.equal(custom.riskRewardRatio, 1.1);
  assert.ok(custom.validation!.confluence!.total < automatic.validation!.confluence!.total);
  const restored = resolveFormationTpSl(custom, null, 'FIXTURE');
  assert.deepEqual(restored.levels, automatic.levels);
  assert.equal(restored.validation?.passed, true);
});
