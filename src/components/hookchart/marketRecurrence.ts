/**
 * Opt-in statistical recurrence search. No network, timers, state, or account data.
 * All events are calculated from *completed* exchange candles only.
 * Findings describe observed frequency, NOT trade-win probabilities.
 */
export type RecurrenceBar = { t: number; o: number; h: number; l: number; c: number; v: number };
export type RecurrenceKind = 'impulse' | 'volume';
export type RecurrenceCycle = 'hour' | 'halfHour' | 'quarterHour' | 'london' | 'newYork' | 'tokyo';
export type RecurrenceFinding = {
  kind: RecurrenceKind;
  cycle: RecurrenceCycle;
  minute: number;
  hits: number;
  observations: number;
  holdoutHits: number;
  holdoutObservations: number;
  rate: number;
  baselineRate: number;
  status: 'repeat' | 'preliminary';
  score: number;
  /** Historical event times, capped and sourced from the actual candle series. */
  recentTimes: number[];
};
export type MarketRecurrenceMark = {
  t: number;
  /** Width of the source candle: a 1m chart has 5m precision for weekly findings. */
  windowMs: number;
  kind: RecurrenceKind;
  status: 'repeat' | 'preliminary';
};

/**
 * Only completed source-bar intervals may be drawn. The returned width makes
 * coarse 5m observations visibly different from 1m price-accurate events.
 * Bounded to at most 18 marks regardless of report size.
 */
export function createMarketRecurrenceMarks(report: RecurrenceReport): MarketRecurrenceMark[] {
  const windowMs = report.timeframeMs;
  if (!Number.isFinite(windowMs) || windowMs < 60_000 || windowMs > 86_400_000) return [];
  const marks: MarketRecurrenceMark[] = [];
  const seen = new Set<string>();
  for (const finding of report.findings) {
    for (const t of finding.recentTimes.slice(-6)) {
      if (!Number.isFinite(t) || t + windowMs > report.completedAt) continue;
      const key = t + ':' + finding.kind;
      if (seen.has(key)) continue;
      seen.add(key);
      marks.push({ t, windowMs, kind: finding.kind, status: finding.status });
      if (marks.length === 18) return marks;
    }
  }
  return marks;
}
export type RecurrenceReport = {
  findings: RecurrenceFinding[];
  bars: number;
  coveredDays: number;
  completeness: number;
  /** False if the latest completed bar is too old for a live market scan. */
  fresh?: boolean;
  /** Open time of the latest completed historical candle for live staleness checks. */
  latestBarTimeMs?: number;
  timeframeMs: number;
  completedAt: number;
};
const DAY = 86_400_000;
const MAX_DAYS = 7;
const SEVEN_DAYS = DAY * MAX_DAYS;
// At least 24 baseline candles + 35 independent event opportunities.
export const MIN_RECURRENCE_BARS = 60;
export function hasEnoughRecurrenceHistory(
  report: Pick<RecurrenceReport, 'bars' | 'coveredDays' | 'completeness' | 'fresh'>,
): boolean {
  return report.bars >= MIN_RECURRENCE_BARS &&
    report.coveredDays >= 1 && report.completeness >= .85 &&
    report.fresh !== false;
}
const WINDOWS: ReadonlyArray<{ cycle: RecurrenceCycle; minutes: number }> = [
  { cycle: 'hour', minutes: 60 },
  { cycle: 'halfHour', minutes: 30 },
  { cycle: 'quarterHour', minutes: 15 },
];
const SESSIONS = [
  { cycle: 'london' as const, zone: 'Europe/London', hour: 8 },
  { cycle: 'newYork' as const, zone: 'America/New_York', hour: 8 },
  { cycle: 'tokyo' as const, zone: 'Asia/Tokyo', hour: 9 },
];
type Counts = { observations: number; hits: number; trainCount: number; trainHits: number; testCount: number; testHits: number };
const emptyCounts = (): Counts => ({ observations: 0, hits: 0, trainCount: 0, trainHits: 0, testCount: 0, testHits: 0 });
/**
 * One-sided exact binomial tail for an observed event frequency.
 * The null baseline is estimated on the training window and the test remains
 * a separate forward-in-time holdout. No approximated win probability.
 */
/**
 * A valid historical pattern must stop being displayed as LIVE after a feed
 * outage. Called from one browser-tab clock (no requests or worker scans).
 */
export function isRecurrenceReportStale(
  report: Pick<RecurrenceReport, 'fresh' | 'latestBarTimeMs' | 'timeframeMs'>,
  nowMs: number,
): boolean {
  if (report.fresh === false) return true;
  if (report.latestBarTimeMs === undefined) return false; // old serialized fixtures
  return !Number.isFinite(nowMs) || !Number.isFinite(report.latestBarTimeMs) ||
    !Number.isFinite(report.timeframeMs) || report.timeframeMs <= 0 ||
    nowMs - report.latestBarTimeMs > report.timeframeMs * 6;
}

export function recurrenceBinomialTail(hits: number, observations: number, baseline: number): number {
  if (!Number.isSafeInteger(hits) || !Number.isSafeInteger(observations) ||
      hits < 0 || observations < 1 || hits > observations ||
      !Number.isFinite(baseline) || baseline < 0 || baseline > 1) return 1;
  if (hits === 0) return 1;
  if (baseline === 0) return 0;
  if (baseline === 1) return 1;
  let logChoose = 0;
  for (let i = 1; i <= hits; i++)
    logChoose += Math.log(observations - hits + i) - Math.log(i);
  let term = Math.exp(logChoose + hits * Math.log(baseline) +
    (observations - hits) * Math.log1p(-baseline));
  let sum = term;
  for (let i = hits + 1; i <= observations; i++) {
    term *= (observations - i + 1) / i * (baseline / (1 - baseline));
    sum += term;
    if (term < 1e-15 && i > observations * baseline) break;
  }
  return Math.min(1, Math.max(0, sum));
}

const valid = (b: RecurrenceBar) =>
  Number.isFinite(b.t) && Number.isFinite(b.o) && Number.isFinite(b.h) &&
  Number.isFinite(b.l) && Number.isFinite(b.c) && Number.isFinite(b.v) &&
  b.o > 0 && b.l > 0 && b.h >= b.l && b.h >= Math.max(b.o, b.c) &&
  b.l <= Math.min(b.o, b.c) && b.v >= 0;

export function recurrenceBaseTimeframe(timeframe: string): string {
  return timeframe === '1m' ? '5m' : timeframe;
}
export function expectedRecurrenceBars(timeframeMs: number): number {
  return Math.ceil(SEVEN_DAYS / timeframeMs);
}

/**
 * Independent hold-out on the last two days guards against fitting random
 * hourly phases to the same seven days. Daily session findings remain
 * preliminary because seven days cannot prove a day-level pattern.
 */
export function findMarketRecurrences(
  input: readonly RecurrenceBar[], timeframeMs: number, nowMs: number,
): RecurrenceReport {
  const report: RecurrenceReport = { findings: [], bars: 0, coveredDays: 0, completeness: 0, fresh: false, timeframeMs, completedAt: nowMs };
  if (!Number.isFinite(timeframeMs) || timeframeMs < 60_000 || timeframeMs > DAY ||
      !Number.isFinite(nowMs) || !input.length) return report;
  const start = nowMs - SEVEN_DAYS;
  const rows = input.filter(valid)
    .filter(b => b.t >= start && b.t + timeframeMs <= nowMs)
    .sort((a, b) => a.t - b.t);
  // Exchange history can contain repeated timestamps from paginated results.
  const unique: RecurrenceBar[] = [];
  for (const row of rows) {
    if (unique.at(-1)?.t === row.t) unique[unique.length - 1] = row;
    else unique.push(row);
  }
  report.bars = unique.length;
  report.latestBarTimeMs = unique.at(-1)?.t;
  report.coveredDays = unique.length ? Math.max(0, (unique.at(-1)!.t - unique[0].t + timeframeMs) / DAY) : 0;
  const expected = unique.length
    ? Math.max(1, Math.round((unique.at(-1)!.t - unique[0].t) / timeframeMs) + 1) : 0;
  report.completeness = expected ? Math.min(1, unique.length / expected) : 0;
  // A stale WebSocket stream must be reported as insufficient history,
  // not as a fresh market without recurring events.
  report.fresh = unique.length > 0 && nowMs - unique[unique.length - 1].t <= timeframeMs * 6;
  // Do not "discover" cycles that are merely market hours or feed gaps.
  if (!hasEnoughRecurrenceHistory(report)) return report;
  const events: Array<{ time: number; impulse: boolean; volume: boolean }> = [];
  // Use only PAST bars to set local volatility and volume baselines.
  let sumRange = 0, sumVolume = 0;
  const warmup = 24;
  for (let i = 0; i < unique.length; i++) {
    const b = unique[i];
    const range = (b.h - b.l) / b.o;
    if (i >= warmup) {
      const localRange = sumRange / warmup;
      const localVolume = sumVolume / warmup;
      if (localRange > 0 && localVolume > 0) {
        const body = Math.abs(b.c - b.o) / b.o;
        events.push({
          time: b.t,
          impulse: range >= localRange * 1.75 && body >= localRange * .55,
          volume: b.v >= localVolume * 1.9 && range >= localRange * .85,
        });
      }
      const removed = unique[i - warmup];
      sumRange -= (removed.h - removed.l) / removed.o;
      sumVolume -= removed.v;
    }
    sumRange += range;
    sumVolume += b.v;
  }
  if (events.length < 35) return report;
  const cutoff = nowMs - 2 * DAY;
  const types: readonly RecurrenceKind[] = ['impulse', 'volume'];
  const result: RecurrenceFinding[] = [];
  // Only hour boundaries can match a session opening. Preselect them once
  // (e.g. 168 of 2016 5m candles), then apply IANA/DST conversion per
  // session and candidate. This keeps the expensive formatter off the hot path.
  const hourCandidates: number[] = [];
  for (let i = 0; i < events.length; i++)
    if (events[i].time % 3_600_000 === 0) hourCandidates.push(i);
  const sessionIndexes = SESSIONS.map(session => {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: session.zone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    const indexes: number[] = [];
    for (const i of hourCandidates) {
      const parts = Object.fromEntries(fmt.formatToParts(new Date(events[i].time))
        .filter(x => x.type === 'weekday' || x.type === 'hour' || x.type === 'minute')
        .map(x => [x.type, x.value]));
      if (parts.weekday !== 'Sat' && parts.weekday !== 'Sun' &&
          Number(parts.hour) === session.hour && Number(parts.minute) === 0) indexes.push(i);
    }
    return { cycle: session.cycle, indexes };
  });
  for (const kind of types) {
    const train = events.filter(event => event.time < cutoff);
    const test = events.filter(event => event.time >= cutoff);
    if (train.length < 30 || test.length < 10) continue;
    const trainBaseline = train.filter(event => event[kind]).length / train.length;
    const testBaseline = test.filter(event => event[kind]).length / test.length;
    if (trainBaseline <= 0 || testBaseline <= 0) continue;
    const phaseCount = WINDOWS
      .filter(({minutes}) => timeframeMs <= minutes * 60_000 && (minutes * 60_000) % timeframeMs === 0)
      .reduce((total, {minutes}) => total + minutes * 60_000 / timeframeMs, 0);
    // Conservative family-wise correction across both scanned event kinds.
    const alpha = .05 / Math.max(1, phaseCount * types.length);
    for (const { cycle, minutes } of WINDOWS) {
      const slotMs = minutes * 60_000;
      if (timeframeMs > slotMs || slotMs % timeframeMs !== 0) continue;
      const counts = new Map<number, Counts>();
      for (const event of events) {
        const phase = Math.floor((event.time % slotMs) / 60_000);
        const count = counts.get(phase) || emptyCounts();
        count.observations++;
        if (event[kind]) count.hits++;
        if (event.time < cutoff) {
          count.trainCount++;
          if (event[kind]) count.trainHits++;
        } else {
          count.testCount++;
          if (event[kind]) count.testHits++;
        }
        counts.set(phase, count);
      }
      for (const [minute, count] of counts) {
        if (count.trainCount < 30 || count.testCount < 12 || count.trainHits < 6 || count.testHits < 3) continue;
        const trainRate = count.trainHits / count.trainCount;
        const testRate = count.testHits / count.testCount;
        const improvement = trainRate - trainBaseline;
        const testImprovement = testRate - testBaseline;
        // A minimum excess plus an independent hold-out: frequency is not P&L.
        if (improvement < .08 || testImprovement < .05 ||
            trainRate < trainBaseline * 1.45 || testRate < testBaseline * 1.2 ||
            recurrenceBinomialTail(count.trainHits, count.trainCount, trainBaseline) > alpha ||
            recurrenceBinomialTail(count.testHits, count.testCount, testBaseline) > alpha) continue;
        result.push({
          kind, cycle, minute, hits: count.hits, observations: count.observations,
          holdoutHits: count.testHits, holdoutObservations: count.testCount,
          rate: count.hits / count.observations,
          baselineRate: (trainBaseline * train.length + testBaseline * test.length) / events.length,
          status: 'repeat', score: improvement * 65 + testImprovement * 85 + Math.min(10, count.testHits),
          recentTimes: events.filter(event => event[kind] &&
            Math.floor((event.time % slotMs) / 60_000) === minute)
            .slice(-6).map(event => event.time),
        });
      }
    }
    // Session opens are evaluated as exploratory only; 5-7 samples are NOT
    // enough to call these statistical confirmations.
    for (const session of sessionIndexes) {
      let total = 0, hits = 0, lastTwo = 0, lastTwoHits = 0;
      for (const i of session.indexes) {
        total++;
        if (events[i][kind]) hits++;
        if (events[i].time >= cutoff) {
          lastTwo++;
          if (events[i][kind]) lastTwoHits++;
        }
      }
      if (total >= 4 && hits >= 3 && hits / total >= .6 &&
          hits / total >= trainBaseline * 1.5 && lastTwoHits >= 1) {
        result.push({
          kind, cycle: session.cycle, minute: 0, hits, observations: total,
          holdoutHits: lastTwoHits, holdoutObservations: lastTwo,
          rate: hits / total, baselineRate: trainBaseline,
          status: 'preliminary', score: (hits / total - trainBaseline) * 35,
          recentTimes: session.indexes.filter(i => events[i][kind])
            .slice(-6).map(i => events[i].time),
        });
      }
    }
  }
  // A single hourly event may also match the 30/15-minute harmonic windows.
  // Never display the same historical observations as three separate patterns.
  const accepted: RecurrenceFinding[] = [];
  const seen = new Set<string>();
  for (const finding of result.sort((a, b) =>
    (a.status === b.status ? 0 : a.status === 'repeat' ? -1 : 1) || b.score - a.score)) {
    const key = finding.kind + ':' + finding.cycle + ':' + finding.minute;
    if (seen.has(key)) continue;
    seen.add(key);
    const alias = accepted.some(previous => {
      if (previous.kind !== finding.kind || previous.recentTimes.length < 4 ||
          finding.recentTimes.length < 4) return false;
      const intersection = finding.recentTimes.filter(t => previous.recentTimes.includes(t)).length;
      return intersection / Math.min(previous.recentTimes.length, finding.recentTimes.length) >= .8;
    });
    if (alias) continue;
    accepted.push(finding);
    if (accepted.length === 3) break;
  }
  report.findings = accepted;
  return report;
}
