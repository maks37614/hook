import type { ChartMarkerInfo, DetectedFormation, Kline, PatternBias, Timeframe } from '../types';
import { sampleWickTouches } from './wickTouchEvidence';
import type { WickTouchBar } from './wickTouchEvidence';
import type { TpSlTouchState } from './tpSlConstructor';

/** Preliminary structures only. They must never be treated as validated trade signals. */
export type EarlyFormationStage = 'potential' | 'forming';
export interface EarlyFormationCandidate {
  id: string;
  patternKey: 'double_bottom' | 'double_top';
  name: string;
  bias: Exclude<PatternBias, 'neutral'>;
  stage: EarlyFormationStage;
  firstPivot: number;
  neckline: number;
  earlyEntryMin: number;
  earlyEntryMax: number;
  breakoutEntry: number;
  /** Stop behind the first pivot, for a conditional early reversal entry. */
  stopLoss: number;
  /** Separate structure/ATR stop below/above the neckline for a confirmed breakout entry. */
  breakoutStopLoss: number;
  target: number;
  earlyRiskReward: number;
  breakoutRiskReward: number;
  /** Exact market PRICE_FILTER tick size when the exchange metadata was reachable. */
  tickSize?: number;
  tickVerified?: boolean;
  observedAt: number;
  explanation: string;
  wickTouchBars?: WickTouchBar[];
  /** Relative index of the last CLOSED scanner candle; used for live touch updates. */
  wickSnapshotEndIndex?: number;
  tpSlBuilder?: { source: 'custom'; touches: TpSlTouchState; levelStatus?: 'applied' | 'invalid' };
}
const roundPrice = (p: number) => Number(p.toPrecision(9));
export const EARLY_EXECUTION_COST_PER_SIDE = 0.001; // Illustrative 0.1% fee/slippage allowance each way.
const TIMEFRAME_SECONDS: Record<Timeframe, number> = { '5s': 5, '30s': 30,
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
};
const SUPPORTED_INTERVALS = new Set(Object.values(TIMEFRAME_SECONDS));

/**
 * One strict candle gate for early W/M in both server and browser scanners.
 * Reject the entire sequence when any candle is malformed, duplicated, gapped,
 * or uses a different interval. Never stitch a false shape across missing bars.
 *
 * The last (open) exchange candle is dropped, not inspected as a completed swing.
 * requireFresh prevents the browser fallback from publishing stale exchange data.
 */
export function prepareEarlyFormationCandles(
  input: Kline[],
  timeframe?: Timeframe,
  nowMs = Date.now(),
  requireFresh = false,
): Kline[] | null {
  if (!Array.isArray(input) || input.length < 32 || !Number.isFinite(nowMs)
    || input.some(c => !c || !Number.isFinite(c.time))) return null;
  const ordered = [...input].sort((a, b) => a.time - b.time);
  if (ordered.some(c => !c
    || ![c.time, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite)
    || !Number.isInteger(c.time) || c.time <= 0 || c.volume < 0
    || Math.min(c.open, c.high, c.low, c.close) <= 0
    || c.high < Math.max(c.open, c.close, c.low)
    || c.low > Math.min(c.open, c.close, c.high))) return null;
  const seconds = timeframe ? TIMEFRAME_SECONDS[timeframe] : ordered[1].time - ordered[0].time;
  if (!SUPPORTED_INTERVALS.has(seconds)
    || ordered.some((c, i) => i > 0 && c.time - ordered[i - 1].time !== seconds)
    || ordered[ordered.length - 1].time * 1000 > nowMs + 5000) return null;
  const last = ordered[ordered.length - 1];
  const closed = (last.time + seconds) * 1000 > nowMs ? ordered.slice(0, -1) : ordered;
  if (closed.length < 32) return null;
  if (requireFresh) {
    const closedUntil = (closed[closed.length - 1].time + seconds) * 1000;
    if (closedUntil > nowMs || nowMs - closedUntil > seconds * 1000 + 90_000) return null;
  }
  return closed;
}
const positive = (n: number) => Number.isFinite(n) && n > 0;
const riskReward = (reward: number, risk: number) => risk > 0 ? Number((reward / risk).toFixed(2)) : 0;

/** Validate both directional trade plans before they may be shown as projections.
 * Early R:R uses the least favorable fill inside the proposed entry zone.
 * Separate stops ensure that breakout R:R reflects a different trade setup. */
export function evaluateEarlyTradePlans(
  bias: 'bullish' | 'bearish',
  earlyEntryMin: number,
  earlyEntryMax: number,
  earlyStop: number,
  neckline: number,
  breakoutEntry: number,
  breakoutStop: number,
  target: number,
  /** Estimated fees and slippage per execution side, not the user's actual exchange tariff. */
  costRatePerSide = EARLY_EXECUTION_COST_PER_SIDE,
): { earlyRiskReward: number; breakoutRiskReward: number } | null {
  if (![earlyEntryMin, earlyEntryMax, earlyStop, neckline, breakoutEntry, breakoutStop, target].every(positive)
    || earlyEntryMin >= earlyEntryMax || !Number.isFinite(costRatePerSide)
    || costRatePerSide < 0 || costRatePerSide > 0.05) return null;

  const long = bias === 'bullish';
  // Entry, target and stop must stay on their correct sides of the trade.
  if (long
    ? !(earlyStop < earlyEntryMin && earlyEntryMax < neckline
      && breakoutStop < neckline && breakoutStop > earlyStop
      && neckline < breakoutEntry && breakoutEntry < target)
    : !(target < breakoutEntry && breakoutEntry < neckline
      && neckline < earlyEntryMin && earlyEntryMax < earlyStop
      && neckline < breakoutStop && breakoutStop < earlyStop)) return null;

  const worstEarlyEntry = long ? earlyEntryMax : earlyEntryMin;
  const earlyReward = long ? target - worstEarlyEntry : worstEarlyEntry - target;
  const earlyRisk = long ? worstEarlyEntry - earlyStop : earlyStop - worstEarlyEntry;
  const breakoutReward = long ? target - breakoutEntry : breakoutEntry - target;
  const breakoutRisk = long ? breakoutEntry - breakoutStop : breakoutStop - breakoutEntry;
  if (Math.min(earlyReward, earlyRisk, breakoutReward, breakoutRisk) <= 0) return null;
  // Projected net R:R includes estimated execution costs on both legs.
  // Validate *unrounded* ratios so 0.996 is never accepted as 1.00.
  const earlyEntry = worstEarlyEntry;
  const earlyExitCost = (earlyEntry + target) * costRatePerSide;
  const earlyStopCost = (earlyEntry + earlyStop) * costRatePerSide;
  const breakoutExitCost = (breakoutEntry + target) * costRatePerSide;
  const breakoutStopCost = (breakoutEntry + breakoutStop) * costRatePerSide;
  const netEarlyReward = earlyReward - earlyExitCost;
  const netBreakoutReward = breakoutReward - breakoutExitCost;
  if (netEarlyReward <= 0 || netBreakoutReward <= 0) return null;
  const earlyRatio = netEarlyReward / (earlyRisk + earlyStopCost);
  const breakoutRatio = netBreakoutReward / (breakoutRisk + breakoutStopCost);
  return earlyRatio >= 1 && breakoutRatio >= .8
    ? { earlyRiskReward: riskReward(netEarlyReward, earlyRisk + earlyStopCost),
        breakoutRiskReward: riskReward(netBreakoutReward, breakoutRisk + breakoutStopCost) }
    : null;
}

function atr14(rows: Kline[]): number {
  const recent = rows.slice(-15);
  const ranges = recent.slice(1).map((bar, i) =>
    Math.max(bar.high - bar.low, Math.abs(bar.high - recent[i].close), Math.abs(bar.low - recent[i].close)));
  return ranges.length ? ranges.reduce((a, b) => a + b, 0) / ranges.length : 0;
}

/**
 * Find a first swing, reaction and approach to a possible second swing.
 * Only already-closed candles are considered; no second swing or breakout is
 * assumed. This deliberately complements, rather than changes, detectFormations.
 */
export function detectEarlyReversalFormations(
  input: Kline[],
  symbol: string,
  existing: DetectedFormation[] = [],
  nowMs = Date.now(),
): EarlyFormationCandidate[] {
  const bars = prepareEarlyFormationCandles(input, undefined, nowMs);
  if (!bars) return [];

  const candles = bars.slice(-65);
  const n = candles.length;
  const last = candles[n - 1];
  const atr = Math.max(atr14(candles), last.close * .0015);
  const seen = new Set(existing.map(f => f.patternKey));
  const results: EarlyFormationCandidate[] = [];

  for (const direction of ['bullish', 'bearish'] as const) {
    const bottom = direction === 'bullish';
    const key = bottom ? 'double_bottom' : 'double_top';
    if (seen.has(key)) continue;
    let best: { candidate: EarlyFormationCandidate; rank: number; startIndex: number } | null = null;

    for (let i = Math.max(8, n - 45); i <= n - 10; i++) {
      const pivot = bottom ? candles[i].low : candles[i].high;
      const neighbors = [candles[i-2], candles[i-1], candles[i+1], candles[i+2]];
      if (!neighbors.every(bar => bottom ? bar.low > pivot : bar.high < pivot)) continue;

      // The intervening high/low becomes a provisional neckline.
      let neckIndex = i + 3;
      for (let j = i + 3; j <= n - 5; j++) {
        if (bottom ? candles[j].high > candles[neckIndex].high :
          candles[j].low < candles[neckIndex].low) neckIndex = j;
      }
      if (neckIndex <= i + 3 || neckIndex >= n - 5) continue;
      const neckline = bottom ? candles[neckIndex].high : candles[neckIndex].low;
      const height = bottom ? neckline - pivot : pivot - neckline;
      if (!positive(height) || height / pivot < .018 || height / pivot > .30) continue;
      // A reversal needs a meaningful prior directional move, not a flat range.
      const trendStart = candles[i - 8].close;
      const priorMove = bottom ? trendStart - pivot : pivot - trendStart;
      if (priorMove < Math.max(height * .18, atr * 1.5)) continue;

      const recent = candles.slice(-4);
      const test = bottom ? Math.min(...recent.map(c => c.low)) :
        Math.max(...recent.map(c => c.high));
      const allAfterNeck = candles.slice(neckIndex + 2);
      const extremeSinceNeck = bottom ? Math.min(...allAfterNeck.map(c => c.low)) :
        Math.max(...allAfterNeck.map(c => c.high));
      // The new approach must be recent rather than an already abandoned test.
      if (bottom ? test > extremeSinceNeck + atr : test < extremeSinceNeck - atr) continue;
      // Invalidation: decisively losing the first bottom / exceeding the first top.
      const allowedBreak = Math.max(atr * .75, pivot * .009);
      if (bottom ? test < pivot - allowedBreak : test > pivot + allowedBreak) continue;
      // An earlier broken anchor invalidates the scenario even if the last four bars recover.
      if (candles.slice(i + 3).some(bar =>
        bottom ? bar.low < pivot - allowedBreak : bar.high > pivot + allowedBreak)) continue;
      // The second approach must not have broken the neckline already.
      if (bottom ? last.close >= neckline - atr * .1 : last.close <= neckline + atr * .1) continue;
      const proximity = Math.abs(test - pivot) / pivot;
      const near = Math.min(.075, Math.max(.05, atr / pivot * 2.4));
      if (proximity > near || Math.abs(last.close - pivot) / pivot > near + Math.max(.01, atr / pivot)) continue;
      // Exclude prices that have not retraced a meaningful part of the first bounce.
      if (bottom ? last.close > neckline - height * .38 : last.close < neckline + height * .38) continue;

      const stage: EarlyFormationStage =
        proximity <= Math.max(.014, atr / pivot * 1.2) ? 'forming' : 'potential';
      const buffer = Math.max(atr * .9, pivot * .011);
      const stopLoss = bottom ? pivot - buffer : pivot + buffer;
      // After a neckline breakout the invalidation is a return back through
      // the neckline, not a full retracement to the original pivot.
      const breakoutBuffer = Math.max(atr * 1.25, height * .18);
      const breakoutStopLoss = bottom ? neckline - breakoutBuffer : neckline + breakoutBuffer;
      const earlyEntryMin = bottom ? pivot - atr * .16 : pivot - atr * .70;
      const earlyEntryMax = bottom ? pivot + atr * .70 : pivot + atr * .16;
      const breakoutEntry = bottom ? neckline + atr * .12 : neckline - atr * .12;
      const target = bottom ? neckline + height : neckline - height;
      const geometry = evaluateEarlyTradePlans(
        direction, earlyEntryMin, earlyEntryMax, stopLoss, neckline,
        breakoutEntry, breakoutStopLoss, target,
      );
      if (!geometry) continue;
      const candidate: EarlyFormationCandidate = {
        id: [symbol.toUpperCase(), key, candles[i].time].join('-'),
        patternKey: key,
        name: bottom ? 'Можливе подвійне дно (W)' : 'Можлива подвійна вершина (M)',
        bias: direction,
        stage,
        firstPivot: roundPrice(pivot),
        neckline: roundPrice(neckline),
        earlyEntryMin: roundPrice(earlyEntryMin),
        earlyEntryMax: roundPrice(earlyEntryMax),
        breakoutEntry: roundPrice(breakoutEntry),
        stopLoss: roundPrice(stopLoss),
        breakoutStopLoss: roundPrice(breakoutStopLoss),
        target: roundPrice(target),
        earlyRiskReward: geometry.earlyRiskReward,
        breakoutRiskReward: geometry.breakoutRiskReward,
        observedAt: last.time,
        explanation: bottom
          ? 'Перше дно і відскок уже є. Ціна наближається до повторного тесту підтримки; друге дно й пробій шиї ще не підтверджені.'
          : 'Перша вершина і відкат уже є. Ціна наближається до повторного тесту опору; друга вершина й пробій шиї ще не підтверджені.',
      };
      const rank = (stage === 'forming' ? 2 : 0) - proximity * 20
        + Math.min(height / pivot, .1) * 10 + (i / n) * .1;
      if (!best || rank > best.rank) best = { candidate, rank, startIndex: i };
    }
    if (best) results.push({ ...best.candidate,
      wickTouchBars: sampleWickTouches(candles, best.startIndex, best.candidate.firstPivot, bottom ? 'low' : 'high'),
      wickSnapshotEndIndex: candles.length - 1,
    });
  }
  return results;
}

/**
 * Conservative projection quantization against the instrument's real exchange
 * PRICE_FILTER tick. Never round an entry/stop/TP optimistically and always
 * recalculate R:R after quantization. If metadata is unavailable, keep the
 * original explicitly unverified projection rather than inventing a tick.
 */
export function alignEarlyFormationToTick(
  candidate: EarlyFormationCandidate,
  tickSize: number | null,
): EarlyFormationCandidate | null {
  if (tickSize === null || !Number.isFinite(tickSize) || tickSize <= 0) {
    return { ...candidate, tickVerified: false };
  }
  const snap = (price: number, mode: 'up' | 'down' | 'nearest') => {
    const ratio = price / tickSize;
    const steps = mode === 'up' ? Math.ceil(ratio - 1e-9)
      : mode === 'down' ? Math.floor(ratio + 1e-9)
        : Math.round(ratio);
    return Number((steps * tickSize).toPrecision(12));
  };
  const bottom = candidate.bias === 'bullish';
  const neckline = snap(candidate.neckline, 'nearest');
  const values = {
    ...candidate,
    firstPivot: snap(candidate.firstPivot, 'nearest'),
    neckline,
    earlyEntryMin: snap(candidate.earlyEntryMin, 'down'),
    earlyEntryMax: snap(candidate.earlyEntryMax, 'up'),
    breakoutEntry: snap(candidate.breakoutEntry, bottom ? 'up' : 'down'),
    stopLoss: snap(candidate.stopLoss, bottom ? 'down' : 'up'),
    breakoutStopLoss: snap(candidate.breakoutStopLoss, bottom ? 'down' : 'up'),
    target: snap(candidate.target, bottom ? 'down' : 'up'),
    tickSize,
    tickVerified: true,
  };
  // Keep a breakout trigger strictly beyond the neckline after rounding.
  if (bottom && values.breakoutEntry <= neckline) values.breakoutEntry = snap(neckline + tickSize, 'up');
  if (!bottom && values.breakoutEntry >= neckline) values.breakoutEntry = snap(neckline - tickSize, 'down');
  const rr = evaluateEarlyTradePlans(candidate.bias, values.earlyEntryMin, values.earlyEntryMax,
    values.stopLoss, values.neckline, values.breakoutEntry, values.breakoutStopLoss, values.target);
  return rr ? { ...values, ...rr } : null;
}

/** Markers are informative projections, not orders or alert subscriptions. */
export function earlyFormationChartMarkers(candidate: EarlyFormationCandidate): ChartMarkerInfo[] {
  return [
    ...(candidate.tpSlBuilder?.touches?.ready === false ? [] : [
      { id: candidate.id + '-early-min', type: 'entry' as const, label: 'Можливий ранній вхід · межа 1', price: candidate.earlyEntryMin, color: '#38bdf8', lineStyle: 'dashed' as const },
      { id: candidate.id + '-early-max', type: 'entry' as const, label: 'Можливий ранній вхід · межа 2', price: candidate.earlyEntryMax, color: '#38bdf8', lineStyle: 'dashed' as const },
      { id: candidate.id + '-trigger', type: 'custom' as const, label: 'Вхід після пробою', price: candidate.breakoutEntry, color: '#a78bfa', lineStyle: 'dashed' as const },
    ]),
    { id: candidate.id + '-stop', type: 'stop_loss', label: 'SL раннього входу', price: candidate.stopLoss, color: '#fb7185', lineStyle: 'dashed' },
    { id: candidate.id + '-breakout-stop', type: 'stop_loss', label: 'SL після пробою', price: candidate.breakoutStopLoss, color: '#f97316', lineStyle: 'dashed' },
    { id: candidate.id + '-target', type: 'target', label: 'Прогноз TP', price: candidate.target, color: '#34d399', lineStyle: 'dashed' },
    { id: candidate.id + '-neckline', type: 'neckline', label: 'Лінія шиї', price: candidate.neckline, color: '#fbbf24', lineStyle: 'dotted' },
  ];
}

/** Visibility in the early preview is local to that preview, not the account TP/SL setting. */
export type EarlyFormationLevelKey =
  | 'earlyEntry' | 'breakoutEntry' | 'target' | 'earlyStop' | 'breakoutStop' | 'neckline';
export type EarlyFormationLevelVisibility = Record<EarlyFormationLevelKey, boolean>;

export function defaultEarlyFormationLevelVisibility(): EarlyFormationLevelVisibility {
  return {
    earlyEntry: true, breakoutEntry: true, target: true,
    earlyStop: true, breakoutStop: true, neckline: true,
  };
}

/** Treat both edges of the early entry zone as one independently toggled level. */
export function filterEarlyFormationChartMarkers(
  markers: ChartMarkerInfo[],
  candidate: Pick<EarlyFormationCandidate, 'id'>,
  visibility: EarlyFormationLevelVisibility,
): ChartMarkerInfo[] {
  const groups = new Map<string, EarlyFormationLevelKey>([
    [candidate.id + '-early-min', 'earlyEntry'],
    [candidate.id + '-early-max', 'earlyEntry'],
    [candidate.id + '-trigger', 'breakoutEntry'],
    [candidate.id + '-target', 'target'],
    [candidate.id + '-stop', 'earlyStop'],
    [candidate.id + '-breakout-stop', 'breakoutStop'],
    [candidate.id + '-neckline', 'neckline'],
  ]);
  return markers.filter(marker => {
    const group = groups.get(marker.id);
    return group === undefined || visibility[group];
  });
}
