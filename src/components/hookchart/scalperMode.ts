/**
 * Opt-in, browser-only scalp geometry. No exchange requests, timers, workers,
 * storage, or account writes. All fitted geometry uses completed candles
 * strictly BEFORE the last completed candle (reserved for confirmation).
 * The final, potentially unfinished candle is used only for a preview.
 */
export type ScalperCandle = { t: number; o: number; h: number; l: number; c: number };
export type ScalperKind = 'range' | 'triangle' | 'wedge' | 'trend' | 'double-top' | 'double-bottom' | 'cascade';
export type ScalperStatus = 'forming' | 'possible' | 'confirmed' | 'failed';
export type ScalperLineStyle = 'auto' | 'solid' | 'dash' | 'dot';
// Shared immutable-by-convention patterns: no new arrays for each rendered line.
const SCALPER_SOLID_DASH: number[] = [];
const SCALPER_STATUS_DASH: number[] = [4, 4];
const SCALPER_MANUAL_DASH: number[] = [7, 5];
const SCALPER_DOT_DASH: number[] = [2, 4];
/** Presentation-only choice: 'auto' keeps the existing per-status visual distinction. */
export function scalperLineDash(style: ScalperLineStyle, status: ScalperStatus): number[] {
  if (style === 'solid' || (style === 'auto' && status === 'confirmed')) return SCALPER_SOLID_DASH;
  if (style === 'dot') return SCALPER_DOT_DASH;
  return style === 'dash' ? SCALPER_MANUAL_DASH : SCALPER_STATUS_DASH;
}
export type ScalperSide = 'up' | 'down';
export type ScalperPoint = { t: number; p: number };
export type ScalperLine = { from: ScalperPoint; to: ScalperPoint; role: 'upper' | 'lower' | 'neckline' | 'cascade-step' };
export type ScalperSetup = {
  id: string;
  kind: ScalperKind;
  status: ScalperStatus;
  score: number;
  lines: ScalperLine[];
  touches: ScalperPoint[];
  breakout?: ScalperPoint & { side: ScalperSide };
};
export type ScalperScene = { setups: ScalperSetup[]; closedAt: number };
type Pivot = { i: number; t: number; p: number };
type Fit = { m: number; b: number; first: Pivot; last: Pivot };
type Structure = {
  id: string;
  kind: ScalperKind;
  score: number;
  upper?: Fit;
  lower?: Fit;
  only?: ScalperSide;
  touches: ScalperPoint[];
  atr: number;
  cascadeSteps?: Pivot[];
};
const EMPTY: ScalperScene = { setups: [], closedAt: 0 };
const MAX_BARS = 90;
const MIN_BARS = 30;
const TIMEFRAME_MS: Readonly<Record<string, number>> = {
  '30s': 30_000, '1m': 60_000, '5m': 300_000, '15m': 900_000,
  '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
};
const validBar = (b: ScalperCandle | undefined): b is ScalperCandle =>
  !!b && Number.isFinite(b.t) && Number.isFinite(b.o) && Number.isFinite(b.h) &&
  Number.isFinite(b.l) && Number.isFinite(b.c) &&
  b.o > 0 && b.c > 0 && b.l > 0 &&
  b.h >= b.l && b.h >= Math.max(b.o, b.c) && b.l <= Math.min(b.o, b.c);
const equalBar = (a: ScalperCandle, b: ScalperCandle) =>
  a.t === b.t && a.o === b.o && a.h === b.h && a.l === b.l && a.c === b.c;
const at = (line: Fit, i: number) => line.m * i + line.b;
const flat = (value: number, start: Pivot, end: Pivot): Fit =>
  ({ m: 0, b: value, first: start, last: end });

/** Legacy least-squares fit. Averaged regression intentionally does not have to
 * intersect actual wick tips; it is available as an explicit opt-in mode.
 */
function regression(pts: Pivot[]): Fit | null {
  if (pts.length < 2) return null;
  const n = pts.length;
  const sx = pts.reduce((sum, p) => sum + p.i, 0);
  const sy = pts.reduce((sum, p) => sum + p.p, 0);
  const sxx = pts.reduce((sum, p) => sum + p.i * p.i, 0);
  const sxy = pts.reduce((sum, p) => sum + p.i * p.p, 0);
  const div = n * sxx - sx * sx;
  if (div <= 0) return null;
  const m = (n * sxy - sx * sy) / div;
  return { m, b: (sy - m * sx) / n, first: pts[0], last: pts[n - 1] };
}
type LineEvidence = {
  contacts: Pivot[];
  quality: number;
  bodyViolations: number;
  observedBars: number;
};

/**
 * Rank a boundary by actual wick contacts, deviation, recency and breaches.
 * Closing beyond the boundary is more serious than a wick sweep; neither
 * is counted as a fresh touch. Only closed historical bars are inspected.
 * The scan is bounded by the same <=90 bars already used for geometry.
 */
function lineEvidence(
  line: Fit, candidates: readonly Pivot[], rows: readonly ScalperCandle[],
  side: 'upper' | 'lower', volatility: number, tolerance: number,
  beginAt = line.first.i,
): LineEvidence {
  const contacts = candidates.filter(p => {
    const bar = rows[p.i];
    const level = at(line, p.i);
    if (!bar || !Number.isFinite(level) || Math.abs(p.p - level) > tolerance) return false;
    const bodyEdge = side === 'upper' ? Math.max(bar.o, bar.c) : Math.min(bar.o, bar.c);
    return side === 'upper' ? level >= bodyEdge - tolerance * .1
      : level <= bodyEdge + tolerance * .1;
  });
  // For horizontal levels the chosen extremal wick can be later than earlier
  // confirmed contacts. Inspect from their earliest contact, not just the
  // bar that happened to set the maximum/minimum price.
  const first = Math.max(0, Math.min(line.first.i, beginAt));
  const last = rows.length - 1;
  let bodyViolations = 0, wickViolations = 0;
  const closeBuffer = volatility * .24;
  const wickBuffer = Math.max(tolerance, volatility * .48);
  for (let i = first; i <= last; i++) {
    const level = at(line, i), bar = rows[i];
    if (side === 'upper') {
      if (bar.c > level + closeBuffer) bodyViolations++;
      if (bar.h > level + wickBuffer) wickViolations++;
    } else {
      if (bar.c < level - closeBuffer) bodyViolations++;
      if (bar.l < level - wickBuffer) wickViolations++;
    }
  }
  const observedBars = Math.max(1, last - first + 1);
  const errorAtr = candidates.reduce((sum, p) => sum + Math.abs(p.p - at(line, p.i)), 0)
    / Math.max(1, candidates.length) / Math.max(volatility, Number.MIN_VALUE);
  const age = last - (contacts.at(-1)?.i ?? line.last.i);
  const contactSpan = contacts.length > 1
    ? contacts[contacts.length - 1].i - contacts[0].i
    : Math.max(0, line.last.i - line.first.i);
  // Evidence score (NOT a win probability). No volume/OI/REST dependencies.
  const quality = Math.max(0, Math.min(100, Math.round(
    40 + Math.min(36, contacts.length * 5)
    + Math.min(10, contactSpan / 8)
    + 12 * Math.max(0, 1 - age / 40)
    - Math.min(25, errorAtr * 17)
    - Math.min(36, bodyViolations / observedBars * 105)
    - Math.min(16, wickViolations / observedBars * 55)
  )));
  return { contacts, quality, bodyViolations, observedBars };
}

/** Fit through two real wick tips, selecting by confirmed touches, recency,
 * deviations and boundary violations. At most 6 pairs for 4 pivots.
 */
function wickAnchoredFit(
  pts: Pivot[], rows: readonly ScalperCandle[], side: 'upper' | 'lower',
  tolerance: number, volatility: number, minimumTouches = 2,
): { line: Fit; touches: Pivot[]; evidence: LineEvidence } | null {
  let best: { line: Fit; touches: Pivot[]; evidence: LineEvidence; score: number } | null = null;
  for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) {
    const first = pts[a], last = pts[b], span = last.i - first.i;
    if (span < 5) continue;
    const m = (last.p - first.p) / span;
    const line: Fit = { m, b: first.p - m * first.i, first, last };
    const evidence = lineEvidence(line, pts, rows, side, volatility, tolerance);
    const touches = evidence.contacts;
    if (touches.length < minimumTouches) continue;
    // Prefer several recently respected wick tips over a mathematical fit
    // which happens to cross the most distant pivots but cuts through bodies.
    const score = evidence.quality * 100 + touches.length * 2 + span * .02;
    if (!best || score > best.score) best = { line, touches, evidence, score };
  }
  return best && { line: best.line, touches: best.touches, evidence: best.evidence };
}
function pivots(rows: readonly ScalperCandle[]) {
  const highs: Pivot[] = [], lows: Pivot[] = [];
  // Two bars on the right: never claim a live wick is a confirmed extremum.
  for (let i = 2; i < rows.length - 2; i++) {
    const a = rows[i];
    // Rightmost tie wins: repeated equal high/low wicks on liquid and tick-size
    // constrained pairs still count once, never as several fake touch points.
    const high = rows.slice(i - 2, i + 3).every((b, j) =>
      j === 2 || (j < 2 ? a.h >= b.h : a.h > b.h));
    const low = rows.slice(i - 2, i + 3).every((b, j) =>
      j === 2 || (j < 2 ? a.l <= b.l : a.l < b.l));
    if (high && (!highs.length || i - highs[highs.length - 1].i >= 3))
      highs.push({ i, t: a.t, p: a.h });
    if (low && (!lows.length || i - lows[lows.length - 1].i >= 3))
      lows.push({ i, t: a.t, p: a.l });
  }
  return { highs, lows };
}
function atr(rows: readonly ScalperCandle[]): number {
  const start = Math.max(1, rows.length - 15);
  let sum = 0;
  for (let i = start; i < rows.length; i++) {
    const bar = rows[i], previous = rows[i - 1].c;
    sum += Math.max(bar.h - bar.l, Math.abs(bar.h - previous), Math.abs(bar.l - previous));
  }
  return sum / Math.max(1, rows.length - start);
}
const point = (p: Pivot): ScalperPoint => ({ t: p.t, p: p.p });
const uniqueTouches = (p: Pivot[]) => p.slice(-8).map(point);
const span = (a: Pivot, b: Pivot) => b.i - a.i;
const worth = (p: Pivot[], min = 5) => p.length >= 2 && span(p[0], p[p.length - 1]) >= min;

/** Favor repeatedly touched prices, not one anomalous ancient wick. */
function touchCluster(points: readonly Pivot[], tolerance: number, last: number): Pivot[] {
  const recent = points.filter(p => last - p.i <= 65);
  let best: Pivot[] = [];
  for (const candidate of recent) {
    const matches = recent.filter(p => Math.abs(p.p - candidate.p) <= tolerance);
    const latest = matches.at(-1)?.i ?? -1;
    const previousLatest = best.at(-1)?.i ?? -1;
    if (matches.length > best.length || (matches.length === best.length && latest > previousLatest))
      best = matches;
  }
  return best;
}

function structureCandidates(rows: readonly ScalperCandle[], averagedRegression = false): Structure[] {
  if (rows.length < MIN_BARS || !rows.every(validBar)) return [];
  for (let i = 1; i < rows.length; i++) if (rows[i].t <= rows[i - 1].t) return [];
  const volatility = atr(rows);
  if (!Number.isFinite(volatility) || volatility <= 0) return [];
  const { highs, lows } = pivots(rows);
  const result: Structure[] = [], last = rows.length - 1;
  let rangeDetected = false;
  const endPivot = { i: last, t: rows[last].t, p: rows[last].c };
  const tolerance = Math.max(volatility * .52, rows[last].c * .00012);

  // Rectangular consolidation: independently established upper AND lower walls.
  const highTouches = touchCluster(highs, tolerance, last);
  const lowTouches = touchCluster(lows, tolerance, last);
  const upperPrice = highTouches.length ? Math.max(...highTouches.map(p => p.p)) : 0;
  const lowerPrice = lowTouches.length ? Math.min(...lowTouches.map(p => p.p)) : 0;
  const upperAnchor = highTouches.find(p => p.p === upperPrice);
  const lowerAnchor = lowTouches.find(p => p.p === lowerPrice);
  const upperLine = upperAnchor && flat(upperPrice, upperAnchor, endPivot);
  const lowerLine = lowerAnchor && flat(lowerPrice, lowerAnchor, endPivot);
  const upperEvidence = upperLine && lineEvidence(upperLine, highTouches, rows,
    'upper', volatility, tolerance, highTouches[0]?.i);
  const lowerEvidence = lowerLine && lineEvidence(lowerLine, lowTouches, rows,
    'lower', volatility, tolerance, lowTouches[0]?.i);
  const width = upperPrice - lowerPrice;
  if (worth(highTouches, 7) && worth(lowTouches, 7) &&
      last - highTouches[highTouches.length - 1].i <= 34 &&
      last - lowTouches[lowTouches.length - 1].i <= 34 &&
      width > volatility * 2.4 && width < rows[last].c * .22 &&
      upperEvidence && lowerEvidence && upperEvidence.quality >= 48 && lowerEvidence.quality >= 48 &&
      upperEvidence.bodyViolations / upperEvidence.observedBars <= .24 &&
      lowerEvidence.bodyViolations / lowerEvidence.observedBars <= .24) {
    rangeDetected = true;
    result.push({
      id: 'range:' + highTouches[0].t + ':' + lowTouches[0].t,
      kind: 'range',
      score: Math.round(.55 * (upperEvidence.quality + lowerEvidence.quality) / 2
        + .45 * Math.min(upperEvidence.quality, lowerEvidence.quality)),
      upper: upperLine!,
      lower: lowerLine!,
      touches: uniqueTouches([...highTouches, ...lowTouches].sort((a, b) => a.i - b.i)),
      atr: volatility,
    });
  }

  // Converging lines: symmetric/ascending/descending triangles and wedges.
  const recentHighs = highs.slice(-4), recentLows = lows.slice(-4);
  const wickTolerance = Math.max(volatility * .35, rows[last].c * .00008);
  const topContact = averagedRegression ? null : wickAnchoredFit(recentHighs, rows, 'upper', wickTolerance, volatility);
  const bottomContact = averagedRegression ? null : wickAnchoredFit(recentLows, rows, 'lower', wickTolerance, volatility);
  const top = averagedRegression ? regression(recentHighs) : topContact?.line;
  const bottom = averagedRegression ? regression(recentLows) : bottomContact?.line;
  if (top && bottom && worth(recentHighs, 10) && worth(recentLows, 10)) {
    const beginning = Math.min(recentHighs[0].i, recentLows[0].i);
    const firstGap = at(top, beginning) - at(bottom, beginning);
    const finalGap = at(top, last) - at(bottom, last);
    const slopeMinimum = volatility * .018;
    const slopeFlat = volatility * .035;
    const upFalling = top.m < -slopeMinimum, downRising = bottom.m > slopeMinimum;
    const triangular = (upFalling && downRising)
      || (Math.abs(top.m) < slopeFlat && downRising)
      || (Math.abs(bottom.m) < slopeFlat && upFalling);
    const wedging = (top.m * bottom.m > 0) && (top.m - bottom.m < -slopeMinimum);
    const regressionError = [
      ...recentHighs.map(p => Math.abs(at(top, p.i) - p.p)),
      ...recentLows.map(p => Math.abs(at(bottom, p.i) - p.p)),
    ].reduce((s, n) => s + n, 0) / (recentHighs.length + recentLows.length);
    const upperQuality = topContact?.evidence
      ?? lineEvidence(top, recentHighs, rows, 'upper', volatility, wickTolerance);
    const lowerQuality = bottomContact?.evidence
      ?? lineEvidence(bottom, recentLows, rows, 'lower', volatility, wickTolerance);
    if ((triangular || wedging) && firstGap > volatility * 1.5 &&
        finalGap > volatility * .4 && finalGap < firstGap * .90 &&
        regressionError <= volatility * .85 &&
        (averagedRegression || (
          upperQuality.quality >= 48 && lowerQuality.quality >= 48 &&
          upperQuality.bodyViolations / upperQuality.observedBars <= .24 &&
          lowerQuality.bodyViolations / lowerQuality.observedBars <= .24
        ))) {
      result.push({
        id: (wedging ? 'wedge:' : 'triangle:') + top.first.t + ':' + bottom.first.t,
        kind: wedging ? 'wedge' : 'triangle',
        score: Math.min(100, Math.round(.55 * (upperQuality.quality + lowerQuality.quality) / 2
          + .45 * Math.min(upperQuality.quality, lowerQuality.quality)
          + Math.min(6, (firstGap - finalGap) / volatility))),
        upper: top, lower: bottom,
        touches: uniqueTouches((averagedRegression
          ? [...recentHighs, ...recentLows]
          : [...topContact!.touches, ...bottomContact!.touches]).sort((a, b) => a.i - b.i)),
        atr: volatility,
      });
    }
  }

  // M/W tests: two separated peaks/troughs with an intervening neckline.
  const doubleTolerance = volatility * .72;
  const lastHighs = highs.slice(-4), lastLows = lows.slice(-4);
  for (const kind of ['double-top', 'double-bottom'] as const) {
    // Repeated extrema on both sides are a range, not two simultaneous M/W reversals.
    if (rangeDetected) break;
    const pts = kind === 'double-top' ? lastHighs : lastLows;
    if (pts.length < 2) continue;
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    if (span(a, b) < 5 || span(a, b) > 48 || Math.abs(a.p - b.p) > doubleTolerance) continue;
    const middle = rows.slice(a.i + 1, b.i);
    if (middle.length === 0) continue;
    const neckline = kind === 'double-top' ? Math.min(...middle.map(r => r.l)) : Math.max(...middle.map(r => r.h));
    if (Math.abs(a.p - neckline) < volatility * 1.7) continue;
    // The neckline originates at the real intervening LOW/HIGH wick, not
    // at the first M/W peak's timestamp (which crosses its candle body).
    const neckAt = a.i + 1 + middle.findIndex(row =>
      kind === 'double-top' ? row.l === neckline : row.h === neckline);
    const neckAnchor: Pivot = { i: neckAt, t: rows[neckAt].t, p: neckline };
    const line = flat(neckline, averagedRegression ? a : neckAnchor, endPivot);
    // Legacy mode places the cap between the peaks/troughs, as before.
    const capAnchor = kind === 'double-top' ? (a.p >= b.p ? a : b) : (a.p <= b.p ? a : b);
    const cap = averagedRegression
      ? flat((a.p + b.p) / 2, a, b)
      : flat(capAnchor.p, capAnchor, endPivot);
    const capSide = kind === 'double-top' ? 'upper' : 'lower';
    const neckSide = kind === 'double-top' ? 'lower' : 'upper';
    const capEvidence = lineEvidence(cap, [a, b], rows, capSide, volatility, doubleTolerance);
    const neckEvidence = lineEvidence(line, [neckAnchor], rows, neckSide, volatility, doubleTolerance);
    result.push({
      id: kind + ':' + a.t + ':' + b.t,
      kind,
      score: Math.round(.72 * capEvidence.quality + .28 * neckEvidence.quality),
      upper: kind === 'double-bottom' ? line : cap,
      lower: kind === 'double-top' ? line : cap,
      only: kind === 'double-top' ? 'down' : 'up',
      touches: [point(a), point(b)], atr: volatility,
    });
  }

  // Single tested support/resistance diagonal: break of the slope.
  for (const side of ['upper', 'lower'] as const) {
    const pts = (side === 'upper' ? highs : lows).slice(-4);
    if (pts.length < 3 || !worth(pts, 8)) continue;
    const touchTolerance = Math.max(volatility * .35, rows[last].c * .00008);
    const contact = averagedRegression ? null : wickAnchoredFit(pts, rows, side, touchTolerance, volatility, 3);
    const fit = averagedRegression ? regression(pts) : contact?.line;
    if (!fit) continue;
    const steepness = fit.m / volatility;
    if (side === 'upper' ? steepness >= -.035 : steepness <= .035) continue;
    const maxError = Math.max(...(averagedRegression ? pts : contact!.touches).map(p => Math.abs(at(fit, p.i) - p.p)));
    if (maxError > volatility * .80) continue;
    const evidence = contact?.evidence ?? lineEvidence(fit, pts, rows, side, volatility, touchTolerance);
    if (!averagedRegression && (evidence.quality < 48 ||
      evidence.bodyViolations / evidence.observedBars > .24)) continue;
    const lineAtEnd = at(fit, last);
    if (lineAtEnd <= 0 || Math.abs(rows[last].c - lineAtEnd) > volatility * 5) continue;
    result.push({
      id: 'trend:' + side + ':' + fit.first.t,
      kind: 'trend', score: evidence.quality,
      ...(side === 'upper' ? { upper: fit, only: 'up' as const } : { lower: fit, only: 'down' as const }),
      touches: uniqueTouches(averagedRegression ? pts : contact!.touches), atr: volatility,
    });
  }
  // A scalping structure is fresh only while its confirmed wick contacts
  // remain recent. Otherwise a dormant M/W or trend could live indefinitely
  // in the 90-bar scan after the market stops testing its boundaries.
  const MAX_BARS_SINCE_LAST_TOUCH = 34;
  const active = result.filter(candidate => {
    const latestTouchTime = candidate.touches.at(-1)?.t;
    if (latestTouchTime === undefined) return false;
    const latestTouchIndex = rows.findIndex(bar => bar.t === latestTouchTime);
    if (latestTouchIndex < 0 || last - latestTouchIndex > MAX_BARS_SINCE_LAST_TOUCH)
      return false;
    // The old eight-bar invalidation window could resurrect a formation:
    // a confirmed close 10+ bars ago was forgotten even though no new wick
    // contact re-established that boundary. Check from the most recent
    // confirmed contact instead. Older breaks do not condemn a NEW setup
    // that has actually formed fresh wick contacts since the break.
    const buffer = candidate.atr * .35;
    for (let i = latestTouchIndex; i <= last; i++) {
      const upper = candidate.upper && at(candidate.upper, i);
      const lower = candidate.lower && at(candidate.lower, i);
      if (upper !== undefined && (!Number.isFinite(upper) || upper <= 0)) return false;
      if (lower !== undefined && (!Number.isFinite(lower) || lower <= 0)) return false;
      if (upper !== undefined && lower !== undefined && upper <= lower) return false;
      // For M/W the opposite extremum invalidates the setup as well.
      // Wick-only sweeps do NOT invalidate it; closes beyond the ATR buffer do.
      if (upper !== undefined && rows[i].c > upper + buffer) return false;
      if (lower !== undefined && rows[i].c < lower - buffer) return false;
    }
    return true;
  });
  // Avoid multiple competing geometries in a dense Terminal grid.
  return active.sort((a, b) => b.score - a.score).slice(0, 2);
}

/**
 * Repeated, distinct wick-tested Highs or Lows form a compact 3–5-level
 * cascade. Use confirmed swing pivots only: the last two completed bars are
 * intentionally not eligible to establish new pivots. This avoids marking
 * rapid intrabar flickers as independent levels.
 *
 * The flat outer boundary is the actionable breakout limit; the short shelves
 * preserve the individual wick prices visually without painting huge rays
 * across an already-crowded chart. All work remains in the <=90-candle cache.
 */
/**
 * A price-level cascade is a compact stack of DISTINCT local High/Low levels,
 * not repeated tests of the same horizontal resistance/support.
 * Preserve repeated touches as evidence without counting them as new tiers.
 * Only confirmed wick pivots in the existing bounded, closed-bar snapshot
 * can create tiers; the newest completed bar is reserved for confirmation.
 */
function cascadeCandidates(rows: readonly ScalperCandle[]): Structure[] {
  if (rows.length < MIN_BARS || !rows.every(validBar)) return [];
  for (let i = 1; i < rows.length; i++) if (rows[i].t <= rows[i - 1].t) return [];
  const volatility = atr(rows);
  if (!Number.isFinite(volatility) || volatility <= 0) return [];
  const { highs, lows } = pivots(rows);
  const last = rows.length - 1;
  const price = rows[last].c;
  // Require a real price difference between tiers while allowing liquid and
  // micro-priced symbols to scale with volatility. Keep the full stack compact
  // (at most 0.8% of price), rather than accepting arbitrary trend extremes.
  const minimumStep = Math.max(volatility * .12, price * .00004);
  const maximumSpread = Math.min(Math.max(volatility * 3, price * .0015), price * .008);
  const found: Structure[] = [];
  for (const side of ['upper', 'lower'] as const) {
    const recent = (side === 'upper' ? highs : lows).filter(p => last - p.i <= 46);
    if (recent.length < 3 || last - recent[recent.length - 1].i > 20) continue;

    // Traverse from the latest confirmed swing and collapse repeat tests of
    // one price. A level can be revisited without fabricating another tier.
    const distinct: Pivot[] = [];
    for (let i = recent.length - 1; i >= 0 && distinct.length < 5; i--) {
      const pivot = recent[i];
      if (distinct.every(existing => Math.abs(existing.p - pivot.p) >= minimumStep))
        distinct.unshift(pivot);
    }
    if (distinct.length < 3) continue;

    let selected: Pivot[] | null = null;
    for (let n = Math.min(5, distinct.length); n >= 3; n--) {
      const group = distinct.slice(-n);
      const values = group.map(p => p.p);
      const high = Math.max(...values), low = Math.min(...values);
      if (high - low > maximumSpread || group[n - 1].i - group[0].i < 9) continue;
      if (group.slice(1).some((p, i) => p.i - group[i].i > 20)) continue;
      // Each swing needs a meaningful counter-move; adjacent candle noise
      // that barely forms a local pivot must not become a scalp level.
      const retraces = group.slice(1).every((p, i) => {
        const previous = group[i];
        const intervening = rows.slice(previous.i + 1, p.i);
        if (!intervening.length) return false;
        return side === 'upper'
          ? Math.min(previous.p, p.p) - Math.min(...intervening.map(bar => bar.l)) >= volatility * .35
          : Math.max(...intervening.map(bar => bar.h)) - Math.max(previous.p, p.p) >= volatility * .35;
      });
      if (!retraces) continue;
      const boundary = side === 'upper' ? high : low;
      const buffer = Math.max(volatility * .24, boundary * .00004);
      // A closed break of the OUTERMOST tier invalidates an old stack.
      // Crossing an inner tier does not incorrectly erase the outer ones.
      const violated = rows.slice(group[0].i).some(bar =>
        side === 'upper' ? bar.c > boundary + buffer : bar.c < boundary - buffer);
      if (violated || Math.abs(price - boundary) > Math.max(volatility * 4, price * .004)) continue;
      selected = group;
      break;
    }
    if (!selected) continue;
    const boundary = side === 'upper'
      ? Math.max(...selected.map(p => p.p))
      : Math.min(...selected.map(p => p.p));
    const endPivot: Pivot = { i: last, t: rows[last].t, p: price };
    const line = flat(boundary, selected[0], endPivot);
    found.push({
      id: 'cascade:' + side + ':' + selected[0].t,
      kind: 'cascade', score: Math.min(95, 48 + selected.length * 8
        + Math.max(0, 16 - (last - selected[selected.length - 1].i))),
      ...(side === 'upper' ? { upper: line, only: 'up' as const }
        : { lower: line, only: 'down' as const }),
      touches: uniqueTouches(selected), cascadeSteps: selected, atr: volatility,
    });
  }
  // Keep at most one upper and one lower stack; preserve both when present.
  return found.sort((a, b) => b.score - a.score).slice(0, 2);
}

function project(fit: Fit, rows: readonly ScalperCandle[], lastIndex: number, role: ScalperLine['role']): ScalperLine {
  return { from: { t: fit.first.t, p: at(fit, fit.first.i) },
    to: { t: rows[lastIndex].t, p: at(fit, lastIndex) }, role };
}
function presentation(candidate: Structure, rows: readonly ScalperCandle[]): ScalperSetup | null {
  const liveIndex = rows.length - 1, closedIndex = liveIndex - 1;
  const completed = rows[closedIndex], live = rows[liveIndex];
  // A converging formation expires at the apex. After its walls cross,
  // one candle can appear above the upper wall and below the lower wall.
  const projectedUpper = candidate.upper && at(candidate.upper, liveIndex);
  const projectedLower = candidate.lower && at(candidate.lower, liveIndex);
  if ((projectedUpper !== undefined && (!Number.isFinite(projectedUpper) || projectedUpper <= 0)) ||
      (projectedLower !== undefined && (!Number.isFinite(projectedLower) || projectedLower <= 0)) ||
      (projectedUpper !== undefined && projectedLower !== undefined && projectedUpper <= projectedLower))
    return null;
  const lines: ScalperLine[] = [];
  if (candidate.upper) lines.push(project(candidate.upper, rows, liveIndex, candidate.kind === 'double-bottom' ? 'neckline' : 'upper'));
  if (candidate.lower) lines.push(project(candidate.lower, rows, liveIndex, candidate.kind === 'double-top' ? 'neckline' : 'lower'));
  if (candidate.cascadeSteps) candidate.cascadeSteps.forEach((step, i) => {
    const nextTime = candidate.cascadeSteps![i + 1]?.t ?? rows[liveIndex].t;
    lines.push({ from: point(step), to: { t: nextTime, p: step.p }, role: 'cascade-step' });
  });
  const buffer = Math.max(candidate.atr * .14, live.c * .00008);
  type Hit = { state: ScalperStatus; side: ScalperSide; bar: ScalperCandle };
  const classify = (bar: ScalperCandle, index: number, confirmed: boolean): Hit | null => {
    const previous = rows[index - 1];
    if (!previous || !validBar(previous)) return null;
    const upper = candidate.upper && at(candidate.upper, index);
    const lower = candidate.lower && at(candidate.lower, index);
    const previousUpper = candidate.upper && at(candidate.upper, index - 1);
    const previousLower = candidate.lower && at(candidate.lower, index - 1);
    // A breakout is an actual CROSSING of the relevant structure, not
    // another candle closing on the already-broken side of the line.
    const crossesUp = upper !== undefined && previousUpper !== undefined &&
      previous.c <= previousUpper + buffer;
    const crossesDown = lower !== undefined && previousLower !== undefined &&
      previous.c >= previousLower - buffer;
    if (crossesUp && candidate.only !== 'down' && bar.c > upper! + buffer)
      return { state: confirmed ? 'confirmed' : 'possible', side: 'up', bar };
    if (crossesDown && candidate.only !== 'up' && bar.c < lower! - buffer)
      return { state: confirmed ? 'confirmed' : 'possible', side: 'down', bar };
    // A wick rejection counts only when the previous close was inside;
    // re-entry from an old breakout is not a new failed breakout.
    if (confirmed && crossesUp && candidate.only !== 'down' && bar.h > upper! + buffer && bar.c <= upper!)
      return { state: 'failed', side: 'up', bar };
    if (confirmed && crossesDown && candidate.only !== 'up' && bar.l < lower! - buffer && bar.c >= lower!)
      return { state: 'failed', side: 'down', bar };
    return null;
  };
  // A completed-bar confirmation takes precedence over the next live preview.
  const hit = classify(completed, closedIndex, true) || classify(live, liveIndex, false);
  return {
    id: candidate.id, kind: candidate.kind, status: hit?.state || 'forming', score: candidate.score,
    lines, touches: candidate.touches,
    breakout: hit ? { t: hit.bar.t, p: hit.bar.c, side: hit.side } : undefined,
  };
}
export function createScalperAnalyzer() {
  let signature = '', cached: Structure[] = [];
  let historicalSnapshot: ScalperCandle[] = [];
  // Reuse the same immutable overlay when a feed republishes identical OHLC.
  // Only two bar copies are retained; historical data is still value-checked
  // so exchange backfills and in-place candle corrections remain observable.
  let scene: ScalperScene | null = null;
  let lastCompleted: ScalperCandle | null = null;
  let lastPreview: ScalperCandle | null = null;
  const cloneBar = (bar: ScalperCandle): ScalperCandle =>
    ({ t: bar.t, o: bar.o, h: bar.h, l: bar.l, c: bar.c });
  return {
    evaluate(candles: readonly ScalperCandle[], scope: string, averagedRegression = false, cascadeLevels = false): ScalperScene {
      if (candles.length < MIN_BARS + 2) return EMPTY;
      // The last candle can still be forming: never use it to confirm signals.
      // Reject invalid newest bars instead of showing misleading live geometry.
      const end = candles.length - 2;
      if (!validBar(candles[end]) || !validBar(candles[end + 1]) ||
          candles[end + 1].t <= candles[end].t) return EMPTY;
      let start = Math.max(0, end - MAX_BARS);
      // If the exchange skips a bar, do not fit lines through an unknown price
      // path. Use only the most recent contiguous stretch (if long enough).
      const interval = TIMEFRAME_MS[scope.split(':').at(-1) || ''];
      if (interval) {
        for (let i = end + 1; i > start; i--) {
          if (!Number.isFinite(candles[i].t) || !Number.isFinite(candles[i - 1].t) ||
              candles[i].t - candles[i - 1].t !== interval) {
            start = i;
            break;
          }
        }
      }
      if (end - start < MIN_BARS) return EMPTY;
      // The selected fit is part of the cache key; changing it must rebuild
      // geometry immediately, even when every candle is unchanged.
      const key = [scope, averagedRegression, cascadeLevels, start, end, candles[start]?.t, candles[end - 1]?.t].join('|');
      // Compare OHLC VALUES, not object references or the first/last bar.
      // WS repair can revise an interior closed candle after initial loading.
      let changed = signature !== key || historicalSnapshot.length !== end - start;
      if (!changed) {
        for (let i = start; i < end; i++) {
          if (!equalBar(candles[i], historicalSnapshot[i - start])) {
            changed = true;
            break;
          }
        }
      }
      if (changed) {
        signature = key;
        historicalSnapshot = candles.slice(start, end).map(b =>
          ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c }));
        cached = structureCandidates(historicalSnapshot, averagedRegression);
        if (cascadeLevels) cached = [...cached, ...cascadeCandidates(historicalSnapshot)];
        // A changed historical price, market or fit mode must invalidate the
        // live presentation even if the last two OHLC bars are unchanged.
        scene = null;
      }
      if (scene && lastCompleted && lastPreview &&
          equalBar(candles[end], lastCompleted) &&
          equalBar(candles[end + 1], lastPreview)) return scene;
      lastCompleted = cloneBar(candles[end]);
      lastPreview = cloneBar(candles[end + 1]);
      if (!cached.length) {
        scene = { setups: [], closedAt: candles[end].t };
        return scene;
      }
      // Cached pivots are indexed relative to this exact contiguous window.
      const window = candles.slice(start);
      scene = {
        setups: cached.map(s => presentation(s, window)).filter((s): s is ScalperSetup => s !== null),
        closedAt: candles[end].t,
      };
      return scene;
    },
    reset() {
      signature = '';
      cached = [];
      historicalSnapshot = [];
      scene = null;
      lastCompleted = lastPreview = null;
    },
  };
}

const labels = {
  uk: { cascade: 'Каскадний рівень', range: 'Діапазон', triangle: 'Трикутник', wedge: 'Клин', trend: 'Похила', 'double-top': 'Подвійна вершина', 'double-bottom': 'Подвійне дно', forming: 'формується', possible: 'можливий пробій', confirmed: 'пробій підтверджено', failed: 'хибний пробій' },
  en: { cascade: 'Cascade level', range: 'Range', triangle: 'Triangle', wedge: 'Wedge', trend: 'Trendline', 'double-top': 'Double top', 'double-bottom': 'Double bottom', forming: 'forming', possible: 'possible breakout', confirmed: 'breakout confirmed', failed: 'false breakout' },
  pl: { cascade: 'Poziom kaskadowy', range: 'Konsolidacja', triangle: 'Trójkąt', wedge: 'Klin', trend: 'Linia trendu', 'double-top': 'Podwójny szczyt', 'double-bottom': 'Podwójne dno', forming: 'tworzy się', possible: 'możliwe wybicie', confirmed: 'wybicie potwierdzone', failed: 'fałszywe wybicie' },
  ru: { cascade: 'Каскадный уровень', range: 'Диапазон', triangle: 'Треугольник', wedge: 'Клин', trend: 'Наклонная', 'double-top': 'Двойная вершина', 'double-bottom': 'Двойное дно', forming: 'формируется', possible: 'возможный пробой', confirmed: 'пробой подтверждён', failed: 'ложный пробой' },
} as const;
export function scalperLabel(key: ScalperKind | ScalperStatus, language: string): string {
  const locale: keyof typeof labels = language === 'en' || language === 'pl' || language === 'ru' ? language : 'uk';
  return labels[locale][key];
}
