import type { Kline } from '../types';

/** Compact sample of a CLOSED candle: time-relative bar index, selected HIGH/LOW wick, close. */
export type WickTouchBar = readonly [index: number, wick: number, close: number];
export interface WickTouchRule {
  touchTolerancePct: number;
  minTouchGap: number;
  requireRejection: boolean;
}

/** Server-safe, dependency-light extraction from already fetched CLOSED candles.
 * Never fetches, polls, creates a chart or inspects candle bodies for extrema. */
export function sampleWickTouches(
  candles: Kline[], startIndex: number, reference: number, side: 'low' | 'high',
): WickTouchBar[] {
  if (!(reference > 0) || !Number.isFinite(reference)) return [];
  const result: WickTouchBar[] = [];
  for (let i = Math.max(0, startIndex); i < candles.length; i++) {
    const bar = candles[i];
    const wick = side === 'low' ? bar.low : bar.high;
    if (Number.isFinite(wick) && Math.abs(wick - reference) / reference <= .02) {
      result.push([i, wick, bar.close]);
    }
  }
  return result.slice(-50);
}

/** Each independent visit counts once. A later rejection may confirm that visit,
 * but cannot create extra contacts without first leaving the wick zone. */
export function countWickTouches(
  bars: readonly WickTouchBar[], level: number, side: 'low' | 'high', rule: WickTouchRule,
): number {
  if (!(level > 0)) return 0;
  const tolerance = rule.touchTolerancePct / 100 * level;
  let count = 0;
  let lastSampleIndex = -1;
  let lastAcceptedIndex = -Infinity;
  let insideEncounter = false;
  let countedThisEncounter = false;
  let encounterEligible = false;
  for (const [index, wick, close] of bars) {
    if (!Number.isFinite(index) || index <= lastSampleIndex) continue;
    const inside = Math.abs(wick - level) <= tolerance;
    // An omitted sample (>2% from wick) or a present out-of-tolerance sample
    // splits visits. Many consecutive in-zone candles remain a single visit.
    if (!inside || (lastSampleIndex >= 0 && index > lastSampleIndex + 1)) {
      insideEncounter = false;
      countedThisEncounter = false;
      encounterEligible = false;
    }
    if (inside) {
      if (!insideEncounter) {
        insideEncounter = true;
        countedThisEncounter = false;
        encounterEligible = index - lastAcceptedIndex >= rule.minTouchGap;
      }
      const rejection = side === 'low' ? close > level : close < level;
      if (!countedThisEncounter && encounterEligible
        && (!rule.requireRejection || rejection)) {
        count++;
        lastAcceptedIndex = index;
        countedThisEncounter = true;
      }
    }
    lastSampleIndex = index;
  }
  return count;
}
