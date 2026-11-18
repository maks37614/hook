import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import type { DetectedFormation, ScannedCoin } from '../src/types';
import { TP_SL_DEFAULT_RULE, projectUserCoins, sampleWickTouches } from '../src/utils/tpSlConstructor';

/** Synthetic CPU/payload benchmark. This is NOT a substitute for live VPS/APM load tests. */
test('opt-in trade levels remain linear and disabled processing is O(1)', () => {
  const seed: DetectedFormation = {
    id: 'id', patternKey: 'double_bottom', name: 'W', nameEn: 'W',
    category: 'reversal', bias: 'bullish', confidence: 79, status: 'forming',
    statusLabel: 'forming', description: '', detectedAt: 123,
    levels: { entryPrice: 100, targetPrice: 120, stopLossPrice: 95, supportPrice: 95 },
    potentialProfitPct: 20, potentialRiskPct: 5, riskRewardRatio: 4,
    validation: { atrPct: 1.5 } as DetectedFormation['validation'],
    wickTouchBars: Array.from({ length: 10 }, (_, i) =>
      [i * 4, 95 + (i % 2) * .05, 97] as const),
  };
  const many = Array.from({ length: 1_000 }, (_, i) => ({
    symbol: `COIN${i}USDT`, baseAsset: `COIN${i}`, quoteAsset: 'USDT',
    exchange: 'binance', marketType: 'futures', currentPrice: 100,
    priceChange24h: 0, highPrice24h: 101, lowPrice24h: 94,
    volume24hUsd: 1_000_000, timeframe: '1h',
    formations: [
      { ...seed, id: `w${i}` },
      { ...seed, id: `w2-${i}` },
    ], lastUpdated: 1, exchangeUrl: '',
  })) as ScannedCoin[];
  const on = { version: 1 as const, enabled: true,
    rules: { double_bottom: { ...TP_SL_DEFAULT_RULE, customLevelsEnabled: true, entryAtrOffset: .2 } } };
  const off = { ...on, enabled: false };
  const startDisabled = performance.now();
  for (let i = 0; i < 20_000; i++) assert.equal(projectUserCoins(many, off), many);
  const disabledMs = performance.now() - startDisabled;
  const startEnabled = performance.now();
  let projected: ScannedCoin[] = many;
  for (let i = 0; i < 50; i++) projected = projectUserCoins(many, on);
  const enabledMs = performance.now() - startEnabled;
  assert.equal(projected.length, 1_000);
  assert.notEqual(projected[0], many[0]);
  assert.equal(many[0].formations[0].levels.entryPrice, 100);
  console.log('TP_SL_PERF', JSON.stringify({
    users: 1, marketCards: 1_000, formations: 2_000,
    disabled_calls: 20_000, disabled_total_ms: Number(disabledMs.toFixed(3)),
    enabled_calls: 50, enabled_total_ms: Number(enabledMs.toFixed(3)),
    enabled_per_2k_formations_ms: Number((enabledMs / 50).toFixed(3)),
  }));
});

test('bounded wick evidence payload: uses existing closed candles only', () => {
  const candles = Array.from({ length: 70 }, (_, i) => ({
    time: 1_700_000_000 + i * 60, open: 100, high: 103, low: 99,
    close: 100.5, volume: 10,
  }));
  for (const i of [5, 8, 12, 20, 24]) candles[i].low = 95;
  const result = sampleWickTouches(candles, 3, 95, 'low');
  assert.equal(result.length, 5);
  assert.deepEqual(result.map(x => x[0]), [5, 8, 12, 20, 24]);
  assert.ok(JSON.stringify(result).length < 600);
  console.log('TP_SL_WICK_PAYLOAD', JSON.stringify({
    sample_candles: candles.length,
    proximity_samples: result.length,
    additional_bytes_per_formation: JSON.stringify(result).length,
  }));
});
