import type { Kline } from '../types';
import { toHookCandles } from './hookchartData';

/**
 * The shared analysis request cache returns the SAME immutable Kline array
 * to all charts watching a market/timeframe. Convert it to HookChart candles
 * once per tab instead of once per Terminal card. Weak keys ensure expired
 * fetch responses and their derived arrays remain garbage-collectable.
 */
const conversions = new WeakMap<Kline[], ReturnType<typeof toHookCandles>>();

export function sharedAnalysisHookCandles(rows: Kline[]): ReturnType<typeof toHookCandles> {
  const cached = conversions.get(rows);
  if (cached) return cached;
  const candles = toHookCandles(rows);
  conversions.set(rows, candles);
  return candles;
}
