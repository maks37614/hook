import type { Kline } from '../types';
import { createScalperAnalyzer, type ScalperLine } from '../components/hookchart/scalperMode';

export type TerminalAlertKind = 'impulse' | 'round' | 'structure';
export type TerminalAlertSide = 'up' | 'down';
export type TerminalMarketSignal = {
  kind: TerminalAlertKind;
  side: TerminalAlertSide;
  /** Stable setup identity; the controller applies a separate cooldown per market scope. */
  key: string;
  level?: number;
  distancePct?: number;
  movementPct?: number;
  quality?: number;
  structure?: 'horizontal' | 'trendline';
};

type Analyzer = ReturnType<typeof createScalperAnalyzer>;
const APPROACH_PCT = 0.4;
const MIN_STRUCTURE_SCORE = 76;
const MAX_HISTORY = 180;

export function terminalAlertMarketScope(
  exchange: string, market: string, symbol: string, timeframe: string,
): string {
  return [exchange, market, symbol.trim().toUpperCase(), timeframe].join(':');
}

function isValidBar(row: Kline): boolean {
  return !!row && Number.isSafeInteger(row.time) && row.time > 0 &&
    [row.open, row.high, row.low, row.close].every(value => Number.isFinite(value) && value > 0) &&
    row.high >= Math.max(row.open, row.close) && row.low <= Math.min(row.open, row.close);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = values.sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function atr(rows: readonly Kline[]): number {
  const start = Math.max(1, rows.length - 15);
  let sum = 0;
  for (let i = start; i < rows.length; i++) {
    const previous = rows[i - 1].close;
    sum += Math.max(rows[i].high - rows[i].low,
      Math.abs(rows[i].high - previous), Math.abs(rows[i].low - previous));
  }
  return sum / Math.max(1, rows.length - start);
}

/** Only completed 2-left/2-right pivots count as previous touches. */
function pivots(rows: readonly Kline[], side: TerminalAlertSide) {
  const result: Array<{ i: number; p: number }> = [];
  for (let i = 2; i < rows.length - 2; i++) {
    const value = side === 'up' ? rows[i].high : rows[i].low;
    const confirmed = rows.slice(i - 2, i + 3).every((row, offset) => {
      if (offset === 2) return true;
      const compared = side === 'up' ? row.high : row.low;
      return side === 'up'
        ? (offset < 2 ? value >= compared : value > compared)
        : (offset < 2 ? value <= compared : value < compared);
    });
    if (confirmed && (!result.length || i - result[result.length - 1].i >= 3))
      result.push({ i, p: value });
  }
  return result.slice(-5);
}

function candidateAtBoundary(
  price: number, level: number, side: TerminalAlertSide,
): number | null {
  if (!(price > 0 && level > 0) || !Number.isFinite(level)) return null;
  // An upper wall is approached from BELOW; a lower wall from ABOVE.
  // A candle already beyond the line must not be presented as "approaching".
  const distance = side === 'up' ? (level - price) / level * 100
    : (price - level) / level * 100;
  return distance >= 0 && distance <= APPROACH_PCT ? distance : null;
}

function levelAt(line: ScalperLine, timestampMs: number): number {
  if (line.to.t === line.from.t) return line.to.p;
  return line.from.p + (line.to.p - line.from.p) *
    (timestampMs - line.from.t) / (line.to.t - line.from.t);
}

/** Strict fallback for a THIRD approach to a wick-anchored trendline with only two previous contacts.
 * Never fit the current candle or use future bars; reject lines cutting through previous bodies.
 */
export function detectTwoTouchTrendApproaches(rows: readonly Kline[]): TerminalMarketSignal[] {
  if (rows.length < 32) return [];
  const live = rows[rows.length - 1];
  const preceding = rows[rows.length - 2];
  const completed = rows.slice(Math.max(0, rows.length - 91), -1);
  if (!completed.every(isValidBar) || !isValidBar(live)) return [];
  const volatility = atr(completed);
  if (!(volatility > 0)) return [];
  const result: TerminalMarketSignal[] = [];
  const currentIndex = completed.length;
  for (const side of ['up', 'down'] as const) {
    if (side === 'up' ? live.close <= preceding.close : live.close >= preceding.close) continue;
    const points = pivots(completed, side);
    let best: TerminalMarketSignal | null = null;
    for (let a = 0; a < points.length; a++) for (let b = a + 1; b < points.length; b++) {
      const first = points[a], second = points[b];
      const span = second.i - first.i, age = currentIndex - second.i;
      if (span < 7 || span > 46 || age < 4 || age > 28) continue;
      const slope = (second.p - first.p) / span;
      // Falling highs = overhead resistance; rising lows = support.
      if (side === 'up' ? slope >= -volatility * .035 : slope <= volatility * .035) continue;
      const projected = first.p + slope * (currentIndex - first.i);
      const distancePct = candidateAtBoundary(live.close, projected, side);
      if (distancePct === null) continue;
      const closeBuffer = Math.max(volatility * .24, projected * .00014);
      const wickBuffer = Math.max(volatility * .55, projected * .00018);
      let bodyBreaks = 0, wickBreaks = 0;
      for (let i = first.i + 1; i < currentIndex; i++) {
        const line = first.p + slope * (i - first.i), bar = completed[i];
        if (side === 'up' ? bar.close > line + closeBuffer : bar.close < line - closeBuffer)
          bodyBreaks++;
        if (side === 'up' ? bar.high > line + wickBuffer : bar.low < line - wickBuffer)
          wickBreaks++;
      }
      // A broken/weak or chronically pierced line is not a clear setup.
      if (bodyBreaks > 0 || wickBreaks > 2) continue;
      const candidate: TerminalMarketSignal = {
        kind: 'structure', side, structure: 'trendline',
        key: 'third-touch:' + side + ':' + completed[first.i].time + ':' + completed[second.i].time,
        level: projected, distancePct,
      };
      if (!best || distancePct < (best.distancePct ?? Infinity)) best = candidate;
    }
    if (best) result.push(best);
  }
  return result;
}

/** Strict two-touch horizontal support/resistance, even without an entire
 * two-sided range. The intervening swing must be clearly visible (>2 ATR).
 * Current/open candles never become historical touches.
 */
export function detectTwoTouchHorizontalApproaches(rows: readonly Kline[]): TerminalMarketSignal[] {
  if (rows.length < 32) return [];
  const live = rows[rows.length - 1], preceding = rows[rows.length - 2];
  const completed = rows.slice(Math.max(0, rows.length - 91), -1);
  if (!completed.every(isValidBar) || !isValidBar(live)) return [];
  const volatility = atr(completed);
  if (!(volatility > 0)) return [];
  const result: TerminalMarketSignal[] = [];
  for (const side of ['up', 'down'] as const) {
    if (side === 'up' ? live.close <= preceding.close : live.close >= preceding.close) continue;
    const points = pivots(completed, side);
    let best: TerminalMarketSignal | null = null;
    for (let a = 0; a < points.length; a++) for (let b = a + 1; b < points.length; b++) {
      const first = points[a], second = points[b];
      const span = second.i - first.i, age = completed.length - second.i;
      if (span < 7 || span > 46 || age < 4 || age > 28) continue;
      const level = side === 'up' ? Math.max(first.p, second.p) : Math.min(first.p, second.p);
      if (Math.abs(first.p - second.p) > Math.max(volatility * .45, level * .00025)) continue;
      const intervening = completed.slice(first.i + 1, second.i);
      if (!intervening.length) continue;
      const swing = side === 'up' ? level - Math.min(...intervening.map(bar => bar.low))
        : Math.max(...intervening.map(bar => bar.high)) - level;
      if (swing < volatility * 2) continue;
      const distancePct = candidateAtBoundary(live.close, level, side);
      if (distancePct === null) continue;
      const buffer = Math.max(volatility * .25, level * .00014);
      // One prior close through the wall invalidates the two-contact setup.
      if (completed.slice(first.i + 1).some(bar =>
        side === 'up' ? bar.close > level + buffer : bar.close < level - buffer)) continue;
      const candidate: TerminalMarketSignal = {
        kind: 'structure', side, structure: 'horizontal',
        key: 'horizontal:' + side + ':' + completed[first.i].time + ':' + completed[second.i].time,
        level, distancePct,
      };
      if (!best || distancePct < (best.distancePct ?? Infinity)) best = candidate;
    }
    if (best) result.push(best);
  }
  return result;
}

/** Price-dependent "major" round numbers: 0.1/0.2/0.7, 1/2/3, 100/200, etc.
 * Deliberately ignore tiny minor ticks near a major number.
 */
export function majorRoundPrice(price: number): { level: number; step: number } | null {
  if (!(price > 0) || !Number.isFinite(price)) return null;
  const exponent = Math.floor(Math.log10(price));
  const step = price >= 1 ? 10 ** (exponent - 1) : price >= .1 ? .1 : 10 ** exponent;
  if (!(step > 0) || !Number.isFinite(step)) return null;
  const level = Number((Math.round(price / step) * step).toPrecision(12));
  return level > 0 ? { level, step } : null;
}

/** Pure market classification. Called at most once per second per unique scope.
 * The caller owns an analyzer and deduplication; this function has no I/O or timers.
 */
export function detectTerminalMarketSignals(
  rowsInput: readonly Kline[], scope: string, analyzer: Analyzer,
): TerminalMarketSignal[] {
  const rows = rowsInput.slice(-MAX_HISTORY);
  if (rows.length < 32 || !rows.slice(-32).every(isValidBar)) return [];
  // A missing bar means exchange history was interrupted; don't join two markets.
  const tf = scope.split(':').at(-1);
  const duration: Record<string, number> = {
    '30s': 30, '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
  };
  const seconds = duration[tf || ''];
  if (!seconds) return [];
  for (let i = Math.max(1, rows.length - 91); i < rows.length; i++)
    if (rows[i].time - rows[i - 1].time !== seconds) return [];

  const live = rows[rows.length - 1], previous = rows[rows.length - 2];
  const signals: TerminalMarketSignal[] = [];

  const movementPct = Math.abs((live.close - live.open) / live.open) * 100;
  const completedMoves = rows.slice(-17, -1).map((bar, index, sample) =>
    index ? Math.abs((bar.close - sample[index - 1].close) / sample[index - 1].close) * 100
      : Math.abs((bar.close - bar.open) / bar.open) * 100);
  const threshold = Math.max(.75, median(completedMoves) * 2.8);
  if (movementPct >= threshold) {
    const side: TerminalAlertSide = live.close >= live.open ? 'up' : 'down';
    signals.push({ kind: 'impulse', side,
      key: 'impulse:' + side + ':' + live.time,
      movementPct });
  }

  const round = majorRoundPrice(live.close);
  if (round) {
    const distancePct = Math.abs(live.close - round.level) / round.level * 100;
    if (distancePct <= .12 && Math.abs(previous.close - round.level) / round.level * 100 > .12) {
      signals.push({ kind: 'round', side: live.close >= previous.close ? 'up' : 'down',
        key: 'round:' + round.level, level: round.level, distancePct });
    }
  }

  const converted = rows.map(row => ({
    t: row.time * 1000, o: row.open, h: row.high, l: row.low, c: row.close,
  }));
  const scene = analyzer.evaluate(converted, scope);
  const vol = atr(rows.slice(-17, -1));
  for (const setup of scene.setups) {
    if (setup.status !== 'forming' || setup.score < MIN_STRUCTURE_SCORE) continue;
    for (const line of setup.lines) {
      if (line.role === 'neckline') continue;
      const side: TerminalAlertSide = line.role === 'upper' ? 'up' : 'down';
      // Only a price actually moving TOWARD the boundary is a live approach.
      if (side === 'up' ? live.close <= previous.close : live.close >= previous.close) continue;
      const projected = levelAt(line, live.time * 1000);
      const distancePct = candidateAtBoundary(live.close, projected, side);
      if (distancePct === null) continue;
      const matchingTouches = setup.touches.filter(touch =>
        Math.abs(touch.p - levelAt(line, touch.t)) <= Math.max(vol * .45, projected * .0002));
      if (matchingTouches.length < 2) continue;
      const oldestTouch = matchingTouches[0].t, latestTouch = matchingTouches[matchingTouches.length - 1].t;
      if (latestTouch - oldestTouch < seconds * 5000 || live.time * 1000 - latestTouch < seconds * 3000) continue;
      signals.push({ kind: 'structure', side,
        structure: setup.kind === 'trend' || setup.kind === 'wedge' ? 'trendline' : 'horizontal',
        key: 'structure:' + side + ':' + setup.id + ':' + line.role,
        level: projected, distancePct, quality: setup.score });
    }
  }
  // Detect wick-anchored two-touch slopes even before the regular Scalper Mode
  // has the three pivots required for its own trend overlay.
  signals.push(...detectTwoTouchTrendApproaches(rows), ...detectTwoTouchHorizontalApproaches(rows));
  return signals;
}
