import type { Kline } from '../../types';
import type { ChartEvidence, ContextNotice, ScenarioId } from './model';
import type { ContextSnapshot } from './context';
import { atr, clamp, linePrice, tradingRange, wickLines, wickPivots, type TradingRange, type WickLine } from './geometry';

export type Candidate = ContextNotice & { triggerAt: number; expiresAt: number; rank: number };
type ScanInput = { snapshot: ContextSnapshot; live: Kline; fast: Kline[]; fastLive?: Kline; evidence: ChartEvidence; at: number };

function consolidationWindows(closed: Kline[], volatility: number) {
  const windows: Array<{ base: TradingRange; stage: 'confirmed' | 'watch' }> = [];
  // To confirm a close, compare it with the box that existed BEFORE that candle.
  // The newest closed bar belongs in a box used to watch the live price.
  const beforeClose = tradingRange(closed.slice(-9, -1), volatility);
  if (beforeClose) windows.push({ base: beforeClose, stage: 'confirmed' });
  const beforeLive = tradingRange(closed, volatility);
  if (beforeLive) windows.push({ base: beforeLive, stage: 'watch' });
  return windows;
}

/** All percentages and timings stated by the user stay explicit here. Geometry
 * tolerances are engineering defaults, not claimed statistical probabilities. */
export function scanContextScenarios({ snapshot: s, live, fast, fastLive, evidence, at }: ScanInput): Candidate[] {
  const out: Candidate[] = [], rows = s.rows, previous = rows.at(-1)!, before = rows.at(-2)!;
  const price = live.close, now = at / 1000, vol = s.volatility, tol = s.tolerance;
  const approachPct = clamp(vol / price * 100 * .6, .06, .4);
  const near = (level: number) => Math.abs(price / level - 1) * 100 <= approachPct;
  const mainDistance = s.upper > 0 ? (s.upper - price) / s.upper * 100 : Infinity;
  const pre = mainDistance >= 0 && mainDistance <= s.preDistancePct;
  const inside = price > s.lower + tol && price < s.upper - tol && !pre;
  const zone = price > s.upper && s.upper > 0 ? 1 : pre ? 3 : price <= s.lower + tol ? 5 : 4;
  const active = rows.slice(-6).reduce((sum, b) => sum + b.volume, 0) > 0
    && rows.slice(-6).some(b => b.high - b.low > vol * .75);

  const add = (scenario: ScenarioId, side: Candidate['side'], level: number, anchor: number,
    options: Partial<Candidate> = {}) => {
    if (!(level > 0) || !Number.isFinite(level)) return;
    const candidate: Candidate = {
      kind: 'scenario', key: `${scenario}:${side}:${anchor}`, scenario,
      zone, side, level, mainLevel: s.upper || undefined,
      invalidateLevel: side === 'down' ? Math.max(...rows.slice(-6).map(b => b.high))
        : Math.min(...rows.slice(-6).map(b => b.low)),
      invalidateSide: side === 'down' ? 'above' : 'below',
      structureTf: '5m', triggerTf: '5m', stage: 'watch', observedAt: at,
      context: s.context, evidence: [], triggerAt: at, expiresAt: at + 30 * 60_000, rank: 1,
      ...options,
    };
    const bar = candidate.triggerTf === '1m' ? fast.at(-1) : previous;
    const baseline = candidate.triggerTf === '1m' ? fast.slice(-17, -1) : rows.slice(-17, -1);
    const meanVolume = baseline.reduce((sum, b) => sum + b.volume, 0) / Math.max(1, baseline.length);
    if (bar && meanVolume > 0 && bar.volume > meanVolume * 1.8) candidate.evidence.push('volume');
    if (bar?.quoteVolume && bar.buyQuoteVolume !== undefined && bar.buyQuoteVolume >= 0
        && bar.buyQuoteVolume <= bar.quoteVolume) {
      const delta = 2 * bar.buyQuoteVolume - bar.quoteVolume;
      if (Math.abs(delta) > bar.quoteVolume * .2) candidate.evidence.push(delta > 0 ? 'delta_up' : 'delta_down');
    }
    const oi = evidence.oi.filter(p => Number.isFinite(p.v) && p.v > 0 && p.t <= at && at - p.t <= 15 * 60_000);
    if (oi.length >= 2 && oi.at(-1)!.v > oi[0].v) candidate.evidence.push('oi_up');
    if (evidence.densityEnabled && evidence.densities.some(d => at - d.at <= 15_000 && d.at <= at
        && d.usd > 0 && Math.abs(d.price - level) <= tol
        && (side === 'neutral' || d.side === (side === 'up' ? 'ASK' : 'BID')))) candidate.evidence.push('density');
    const step = 10 ** (Math.floor(Math.log10(level)) - 1);
    if (step > 0 && Math.abs(Math.round(level / step) * step - level) <= tol) candidate.evidence.push('round');
    out.push(candidate);
  };

  const boundary = (level: number, side: 'up' | 'down', line?: WickLine,
    localRows: Kline[] = rows, current: Kline = live): Partial<Candidate> | null => {
    const last = localRows.at(-1), prior = localRows.at(-2);
    if (!last || !prior) return null;
    const lastLevel = line ? linePrice(line, last.time) : level;
    const priorLevel = line ? linePrice(line, prior.time) : level;
    const crossed = side === 'up' ? last.close > lastLevel + tol && prior.close <= priorLevel + tol
      : last.close < lastLevel - tol && prior.close >= priorLevel - tol;
    if (crossed && (side === 'up' ? current.close >= level - tol : current.close <= level + tol))
      return { stage: 'confirmed', confirmation: 'close',
        triggerAt: (last.time + (localRows === rows ? 300 : 60)) * 1000, rank: 4 };
    // Wick through, close back inside, a REAL 2–3 minute retreat, then a
    // fresh re-break of that wick. Fine timing uses verified 1m bars only.
    if (line && fastLive && fast.length >= 4) {
      const fineTol = atr(fast) * .22;
      for (let i = Math.max(0, fast.length - 5); i < fast.length - 1; i++) {
        const pierced = fast[i], atLine = linePrice(line, pierced.time), elapsed = now - pierced.time - 60;
        if (elapsed < 120 || elapsed > 180) continue;
        const wickOnly = side === 'up' ? pierced.high > atLine + fineTol && pierced.close < atLine
          : pierced.low < atLine - fineTol && pierced.close > atLine;
        if (!wickOnly) continue;
        const retreat = fast.slice(i + 1);
        if (!retreat.every(b => side === 'up' ? b.high < linePrice(line, b.time) + fineTol
          : b.low > linePrice(line, b.time) - fineTol)) continue;
        if (!retreat.some(b => side === 'up' ? b.high < linePrice(line, b.time) - fineTol
          : b.low > linePrice(line, b.time) + fineTol)) continue;
        const target = side === 'up' ? pierced.high : pierced.low;
        if (side === 'up' ? fastLive.close > target : fastLive.close < target)
          return { stage: 'confirmed', confirmation: 'wick_rebreak', level: target,
            triggerAt: at, rank: 5, invalidateLevel: side === 'up' ? pierced.low : pierced.high };
      }
    }
    const distance = side === 'up' ? (level - current.close) / level * 100 : (current.close - level) / level * 100;
    if (distance < 0 || distance > approachPct) return null;
    if (side === 'up' ? current.close <= last.close : current.close >= last.close) return null;
    return { stage: 'watch' };
  };

  // Z5 contains exactly these TWO scenarios. A genuine retreat separates tests.
  for (const low of s.lows.slice(-12)) {
    if (low.price > s.lower + vol * 2 || low.time >= previous.time) continue;
    const elapsed = (now - low.time) / 60;
    const after = rows.slice(low.i + 1);
    const retreat = after.some(b => b.high >= low.price + vol * 2);
    if (low.price <= s.lower + tol && elapsed >= 60 && elapsed <= 120 && retreat && live.low <= low.price + tol
        && price >= low.price - tol && price <= low.price + vol) {
      // A historical undercut before the current return invalidates a full-level test.
      if (!after.some(b => b.low < low.price - tol))
        add('z5_level', 'down', low.price, low.time, { zone: 5, returnMinutes: Math.round(elapsed),
          invalidateSide: 'above', invalidateLevel: low.price + vol * 2, rank: 3 });
    }
    for (let i = low.i + 1; i < rows.length - 2; i++) {
      const sweep = rows[i], penetration = (low.price - sweep.low) / low.price * 100;
      if (penetration < .3 || penetration > .5 || sweep.close < low.price - tol) continue;
      const returned = (now - sweep.time) / 60, tail = rows.slice(i + 1);
      if (returned < 60 || returned > 120 || !tail.some(b => b.high > sweep.low + vol * 2)) continue;
      if (tail.some(b => b.close < sweep.low - tol)) continue;
      const base = tradingRange(rows.slice(-4), vol, 4);
      if (base && base.low >= sweep.low - tol && live.low <= sweep.low + vol && price >= sweep.low - tol)
        add('z5_sweep', 'down', sweep.low, sweep.time, { zone: 5, returnMinutes: Math.round(returned),
          evidence: ['consolidation'], invalidateSide: 'above', invalidateLevel: base.high + tol, rank: 3 });
    }
  }

  if (inside && active) {
    for (const side of ['up', 'down'] as const) {
      const points = (side === 'up' ? s.highs : s.lows).slice(-6);
      // A staircase must be ordered and close on THIS coin's volatility scale.
      for (let start = 0; start <= points.length - 3; start++) {
        const staircase = points.slice(start, start + 3);
        const increasing = staircase.every((p, i) => !i || p.price > staircase[i - 1].price);
        const decreasing = staircase.every((p, i) => !i || p.price < staircase[i - 1].price);
        if ((!increasing && !decreasing) || Math.max(...staircase.map(p => p.price))
            - Math.min(...staircase.map(p => p.price)) > vol * 6) continue;
        const reachable = staircase.map(p => p.price).filter(p => side === 'up' ? p >= price : p <= price)
          .sort((a, b) => Math.abs(a - price) - Math.abs(b - price));
        const level = reachable[0], state = level && boundary(level, side);
        if (state) add('z4_cascade', side, level, staircase[0].time, { ...state, zone: 4, rank: 3 });
      }
      const lines = side === 'up' ? s.upperLines : s.lowerLines;
      for (const line of lines.filter(l => l.touches.length >= 3)) {
        const level = linePrice(line, live.time), state = boundary(level, side, line);
        if (state) add('z4_line', side, level, line.a.time, { ...state, zone: 4, rank: 3 });
      }
    }
    if (evidence.manualLevels.length) {
      const manualAbove = evidence.manualLevels.some(p => p > price + vol);
      const manualBelow = evidence.manualLevels.some(p => p < price - vol);
      const opposite = manualAbove ? s.lows.slice(-2) : manualBelow ? s.highs.slice(-2) : [];
      if (opposite.length === 2 && Math.abs(opposite[0].price - opposite[1].price) <= tol * 2
          && near(opposite[1].price))
        add('z4_reverse', 'neutral', opposite[1].price, opposite[0].time, { zone: 4,
          invalidateLevel: manualAbove ? s.upper : s.lower, invalidateSide: manualAbove ? 'above' : 'below', rank: 3 });
    }
    for (const line of s.upperLines.filter(l => l.a.price < s.upper && s.upper - l.a.price <= vol * 3
      && s.highs.some(p => p.price === s.upper && p.time < l.a.time))) {
        const level = linePrice(line, live.time), state = boundary(level, 'up', line);
        if (state) add('z4_trend', 'up', level, line.a.time, { ...state, zone: 4 });
    }
  }

  const fiveMinuteRanges = mainDistance <= s.preDistancePct ? consolidationWindows(rows, vol) : [];
  if (pre && active) {
    for (const high of s.highs.slice(-4)) {
      const elapsed = (now - high.time) / 60;
      if (elapsed < 10 || elapsed > 20 || high.price >= s.upper - tol) continue;
      const pullback = high.price - Math.min(...rows.slice(high.i + 1).map(b => b.low));
      if (pullback < vol * .5 || pullback > vol * 2) continue;
      const state = boundary(high.price, 'up');
      if (state) add('z3_local', 'up', high.price, high.time, { ...state, zone: 3, rank: 3 });
    }
    for (const line of s.upperLines) {
      const level = linePrice(line, live.time), state = boundary(level, 'up', line);
      if (state && level < s.upper) add('z3_line', 'up', level, line.a.time, { ...state, zone: 3, rank: 3 });
    }
    for (const { base, stage } of fiveMinuteRanges) {
      if (base.high >= s.upper + tol) continue;
      const side = base.lowerTouches >= base.upperTouches ? 'up' : 'down';
      const level = side === 'up' ? base.high : base.low, state = boundary(level, side);
      if (state?.stage !== stage) continue;
      add('z3_range', side, level, base.start, { ...state, zone: 3,
        evidence: ['consolidation'], invalidateLevel: side === 'up' ? base.low - tol : base.high + tol, rank: 3 });
      break;
    }
    const rejected = rows.slice(-4).some(b => b.high >= s.upper - tol && b.close < s.upper - tol);
    if (rejected) for (const line of s.lowerLines) {
      const level = linePrice(line, live.time), state = boundary(level, 'down', line);
      if (state?.stage === 'confirmed') add('z3_reject', 'down', level, line.a.time,
        { ...state, zone: 3, invalidateSide: 'above', invalidateLevel: s.upper + tol, rank: 5 });
    }
  }

  // A fast approach from far away has NO entry event without a new base.
  for (const { base: base5, stage } of fiveMinuteRanges) {
    if (mainDistance >= s.preDistancePct) continue;
    const beforeBase = rows.filter(b => b.time < base5.start).slice(-4);
    const origin = beforeBase[0];
    if (origin && (base5.high / origin.open - 1) * 100 >= Math.max(4, s.context.volatilityPct * 4)) {
      const state = boundary(base5.high, 'up');
      if (state?.stage !== stage) continue;
      add('z3_distance', 'up', base5.high, origin.time, { ...state, zone: pre ? 3 : 1,
        evidence: ['consolidation'], invalidateLevel: base5.low - tol, rank: 4 });
      break;
    }
  }

  // Trend families share geometry but are selected by their DIFFERENT origins.
  if (s.context.regime === 'pump') add('pump', 'up', price, s.pumpAt ? Math.floor(s.pumpAt / 3600) * 3600 : previous.time,
    { zone: null, stage: 'info', rank: 2 });
  if (s.context.regime === 'dump') add('dump', 'down', price, Math.floor(previous.time / 3600) * 3600,
    { zone: null, stage: 'info', rank: 2 });
  const family = s.context.regime === 'pump' ? 'pump' : s.context.regime === 'dump' ? 'dump'
    : s.context.regime === 'post_pump' ? 'post_pump' : null;
  if (family) {
    const side = family === 'pump' ? 'down' : 'up';
    const lines = side === 'down' ? s.lowerLines : s.upperLines;
    const exhaustion = family === 'pump'
      ? live.high / before.close >= 1.1 || previous.high - previous.close > vol
      : before.close / live.low >= 1.1 || previous.close - previous.low > vol;
    for (const line of lines.filter(l => l.touches.length >= 3)) {
      const level = linePrice(line, live.time), state = boundary(level, side, line);
      if (state && (family === 'post_pump' || exhaustion || state.stage === 'confirmed'))
        add(family, side, level, line.a.time, { ...state, zone: null,
          evidence: exhaustion ? ['exhaustion'] : [], rank: 4 });
    }
  }

  if (fast.length < 16 || !fastLive) return out;
  const fastVol = atr(fast), fastTol = fastVol * .22;
  if (!(fastVol > 0)) return out;
  const fNow = fastLive.close;
  // First higher high: known level -> 3/4 one-minute impulse bars -> small
  // correction -> fresh return. No alert on the initial impulse alone.
  for (let i = Math.max(1, fast.length - 14); i <= fast.length - 4; i++) {
    for (const count of [3, 4]) {
      const burst = fast.slice(i, i + count), correction = fast.slice(i + count);
      if (burst.length !== count || correction.length < 1 || correction.length > 4) continue;
      const movement = (burst.at(-1)!.close / burst[0].open - 1) * 100;
      const top = Math.max(...burst.map(b => b.high));
      const crossedLevel = s.upper > 0 && burst[0].open <= s.upper + tol && top > s.upper + tol;
      if (!crossedLevel || movement < 7 || burst.some(b => b.close < b.open - fastTol)) continue;
      const depth = top - Math.min(...correction.map(b => b.low));
      if (depth <= fastTol || depth > (top - burst[0].open) * .3) continue;
      if (!correction.some(b => b.close < b.open) || fNow <= fast.at(-1)!.close) continue;
      const state = boundary(top, 'up', undefined, fast, fastLive);
      if (state) add('z1_first', 'up', top, burst[0].time, { ...state, zone: 1,
        structureTf: '1m', triggerTf: '1m', invalidateLevel: top - depth - fastTol, rank: 5 });
    }
  }

  const precedingBurst = fast.slice(-24, -4).some(b => (b.close / b.open - 1) * 100 >= 5);
  const pastBreak = s.upper > 0 && rows.slice(-12).some(b => b.open <= s.upper + tol && b.close > s.upper + tol);
  if (pastBreak && fNow > s.upper) {
    for (const { base, stage } of consolidationWindows(fast, fastVol)) {
      if (base.low <= s.upper) continue;
      const state = boundary(base.high, 'up', undefined, fast, fastLive);
      if (state?.stage !== stage) continue;
      add('z1_continue', 'up', base.high, base.start, { ...state, zone: 1,
        structureTf: '1m', triggerTf: '1m', evidence: ['consolidation'],
        invalidateLevel: base.low - fastTol, rank: 4 });
      break;
    }
    const geom = fast.slice(0, -1);
    for (const line of wickLines(geom, wickPivots(geom, 'up'), 'up', fastVol, 2)) {
      const level = linePrice(line, fastLive.time), state = boundary(level, 'up', line, fast, fastLive);
      if (state) add('z1_continue', 'up', level, line.a.time, { ...state, zone: 1,
        structureTf: '1m', triggerTf: '1m', rank: 4 });
    }
    const peaks = wickPivots(geom, 'up').slice(-3);
    if (peaks.length === 3 && peaks.every((p, i) => !i || p.price > peaks[i - 1].price)
        && peaks[2].price - peaks[0].price <= fastVol * 6) {
      const level = peaks.find(p => p.price >= fNow)?.price;
      const state = level && boundary(level, 'up', undefined, fast, fastLive);
      if (state) add('z1_continue', 'up', level, peaks[0].time, { ...state, zone: 1,
        structureTf: '1m', triggerTf: '1m', rank: 4 });
    }
  }
  // The low must be identified WHILE it is held, before any sweep. Windows of
  // 4/5 completed minutes are considered separately from the current candle.
  if (precedingBurst) for (const holdCount of [5, 4]) {
    const hold = fast.slice(-holdCount), low = Math.min(...hold.map(b => b.low));
    const high = Math.max(...hold.map(b => b.high));
    if (high - low > fastVol * 2 || hold.filter(b => b.low <= low + fastTol).length < 2) continue;
    const earlier = fast.filter(b => b.time < hold[0].time).slice(-24);
    if (!earlier.length) continue;
    const origin = Math.min(...earlier.map(b => b.open));
    if (high / origin < 1.07 || hold.some(b => b.close < low)) continue;
    const toPriorHigh = s.upper > 0 && high <= s.upper + tol && high / origin >= 1.2
      && (s.upper - high) / s.upper * 100 <= s.preDistancePct;
    const swept = fastLive.low < low - fastTol && fastLive.close >= low;
    if (fNow < low - fastTol || fNow > high + fastVol) continue;
    add(toPriorHigh ? 'temka2' : 'temka1', 'up', low, hold[0].time, {
      zone: toPriorHigh ? 2 : 1, structureTf: '1m', triggerTf: '1m',
      stage: swept ? 'confirmed' : 'watch', invalidateLevel: low - fastVol,
      confirmation: swept ? 'sweep_reclaim' : undefined,
      evidence: ['consolidation'], rank: 5, expiresAt: at + 5 * 60_000,
    });
    break;
  }
  return out;
}
