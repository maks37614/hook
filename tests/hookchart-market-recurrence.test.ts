import test from 'node:test';
import assert from 'node:assert/strict';
import { findMarketRecurrences, recurrenceBaseTimeframe, expectedRecurrenceBars, recurrenceBinomialTail, hasEnoughRecurrenceHistory, isRecurrenceReportStale, type RecurrenceBar } from '../src/components/hookchart/marketRecurrence';

const FIVE_MIN = 300_000;
const END = Date.UTC(2026, 10, 8);
const START = END - 7 * 86_400_000;
function fixture(hourlySpike: boolean): RecurrenceBar[] {
  return Array.from({ length: 2016 }, (_, i) => {
    const t = START + i * FIVE_MIN;
    const minute = new Date(t).getUTCMinutes();
    const spike = hourlySpike && minute === 15;
    return {
      t, o: 100, h: spike ? 103 : 100.09,
      l: spike ? 99.8 : 99.91, c: spike ? 102.5 : 100.02,
      v: spike ? 1_200 : 100,
    };
  });
}

test('1m uses seven-day 5m base, rather than 10080 1m historical candles', () => {
  assert.equal(recurrenceBaseTimeframe('1m'), '5m');
  assert.equal(recurrenceBaseTimeframe('15m'), '15m');
  assert.equal(expectedRecurrenceBars(FIVE_MIN), 2016);
  assert.equal(expectedRecurrenceBars(60_000), 10080);
});

test('repeated hourly spikes are found and checked against last two days', () => {
  const report = findMarketRecurrences(fixture(true), FIVE_MIN, END);
  assert.equal(report.bars, 2016);
  assert.ok(report.findings.some(f => f.cycle === 'hour' && f.minute === 15 &&
    f.kind === 'impulse' && f.status === 'repeat' &&
    f.holdoutHits >= 3 && f.rate > f.baselineRate));
});

test('flat market does not manufacture a pattern', () => {
  const report = findMarketRecurrences(fixture(false), FIVE_MIN, END);
  assert.deepEqual(report.findings, []);
});

test('future or still-open candles cannot create historical events', () => {
  const rows = fixture(false);
  rows.push({ t: END, o: 100, h: 150, l: 99, c: 140, v: 1_000_000 });
  const report = findMarketRecurrences(rows, FIVE_MIN, END);
  assert.equal(report.bars, 2016);
  assert.deepEqual(report.findings, []);
});

test('only the most recent week is analyzed and timeframes below 1m are rejected', () => {
  const previousWeek = fixture(true).map(x => ({ ...x, t: x.t - 7 * 86_400_000 }));
  const report = findMarketRecurrences([...previousWeek, ...fixture(true)], FIVE_MIN, END);
  assert.equal(report.bars, 2016);
  assert.equal(findMarketRecurrences(fixture(true), 30_000, END).findings.length, 0);
});

test('event locations are bounded, belong to finished candles and remain on the chart scope', () => {
  const report = findMarketRecurrences(fixture(true), FIVE_MIN, END);
  assert.ok(report.completeness > .99);
  for (const finding of report.findings) {
    assert.ok(finding.recentTimes.length <= 6);
    assert.ok(finding.recentTimes.every(t => t >= START && t + FIVE_MIN <= END));
    assert.deepEqual([...finding.recentTimes].sort((a, b) => a - b), finding.recentTimes);
  }
});

test('missing candle intervals never count as a reliable recurrence', () => {
  const source = fixture(true).filter((_, index) => index % 2 === 0);
  const report = findMarketRecurrences(source, FIVE_MIN, END);
  assert.ok(report.completeness < .6);
  assert.deepEqual(report.findings, []);
});

test('exact binomial tail is bounded and rejects an isolated lucky run', () => {
  assert.equal(recurrenceBinomialTail(0, 20, .2), 1);
  assert.ok(Math.abs(recurrenceBinomialTail(10, 10, .5) - 1 / 1024) < 1e-12);
  assert.ok(recurrenceBinomialTail(6, 30, .2) > .1);
  assert.ok(recurrenceBinomialTail(18, 30, .2) < .001);
});

test('randomly scattered impulses do not become validated periodic signals', () => {
  let seed = 13579;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const bars = fixture(false).map(bar => {
    const spike = random() < .09;
    return {
      ...bar, h: spike ? 103 : 100.09, l: spike ? 99.8 : 99.91,
      c: spike ? 102.5 : 100.02, v: spike ? 1_200 : 100,
    };
  });
  assert.deepEqual(findMarketRecurrences(bars, FIVE_MIN, END).findings, []);
});

test('15/30/60 minute harmonics are not counted as three independent patterns', () => {
  const findings = findMarketRecurrences(fixture(true), FIVE_MIN, END).findings;
  assert.equal(findings.filter(x => x.kind === 'impulse' &&
    (x.cycle === 'hour' || x.cycle === 'halfHour' || x.cycle === 'quarterHour')).length, 1);
});

test('7-day session analysis respects the London DST boundary', () => {
  // Europe/London falls back on 2026-10-25. 08:00 local is 07:00 UTC
  // on Oct 22/23 but 08:00 UTC on Oct 26/27/28.
  const end = Date.UTC(2026, 9, 29);
  const start = end - 7 * 86_400_000;
  const sessionTimes = new Set([
    Date.UTC(2026, 9, 22, 7), Date.UTC(2026, 9, 23, 7),
    Date.UTC(2026, 9, 26, 8), Date.UTC(2026, 9, 27, 8),
    Date.UTC(2026, 9, 28, 8),
  ]);
  const rows: RecurrenceBar[] = Array.from({ length: 2016 }, (_, i) => {
    const t = start + i * FIVE_MIN;
    const spike = sessionTimes.has(t);
    return {
      t, o: 100, h: spike ? 103 : 100.12,
      l: spike ? 99.8 : 99.92, c: spike ? 102.5 : 100.02,
      v: spike ? 1_300 : 100,
    };
  });
  const report = findMarketRecurrences(rows, FIVE_MIN, end);
  const london = report.findings.find(item => item.cycle === 'london' && item.kind === 'impulse');
  assert.ok(london, 'London session recurrence must survive the IANA DST change');
  assert.equal(london.status, 'preliminary', 'five observations do not validate a daily edge');
  assert.deepEqual(london.recentTimes, [...sessionTimes].sort((a, b) => a - b));
});

test('session timezone conversion considers only hourly candle candidates', () => {
  const previous = Intl.DateTimeFormat.prototype.formatToParts;
  let calls = 0;
  Intl.DateTimeFormat.prototype.formatToParts = function (...args) {
    calls++;
    return previous.apply(this, args);
  };
  try {
    const report = findMarketRecurrences(fixture(true), FIVE_MIN, END);
    assert.equal(report.bars, 2016);
    // 3 sessions x 168 UTC hours = 504 candidates; never 3 x 2016.
    assert.ok(calls <= 3 * 168, 'time-zone formatting should not iterate every 5m candle');
  } finally {
    Intl.DateTimeFormat.prototype.formatToParts = previous;
  }
});


test('4h and 1d seven-day samples are insufficient, not a validated absence of recurrence', () => {
  for (const step of [4 * 3_600_000, 86_400_000]) {
    const count = Math.floor(7 * 86_400_000 / step);
    const rows: RecurrenceBar[] = Array.from({ length: count }, (_, i) => ({
      t: END - (count - i) * step,
      o: 100, h: 101, l: 99, c: 100, v: 100,
    }));
    const report = findMarketRecurrences(rows, step, END);
    assert.ok(report.coveredDays >= 6);
    assert.equal(hasEnoughRecurrenceHistory(report), false);
    assert.deepEqual(report.findings, []);
  }
});

test('a complete week of 1h or 5m history passes the minimum sample requirement', () => {
  const fiveMinutes = findMarketRecurrences(fixture(true), FIVE_MIN, END);
  assert.equal(hasEnoughRecurrenceHistory(fiveMinutes), true);
  const hourly: RecurrenceBar[] = Array.from({ length: 168 }, (_, i) => ({
    t: END - (168 - i) * 3_600_000,
    o: 100, h: 101, l: 99, c: 100, v: 100,
  }));
  assert.equal(hasEnoughRecurrenceHistory(findMarketRecurrences(hourly, 3_600_000, END)), true);
});


test('stale-but-complete market data is insufficient, not an absence of recurrences', () => {
  const report = findMarketRecurrences(fixture(true), FIVE_MIN, END + FIVE_MIN * 10);
  assert.ok(report.bars > 1000);
  assert.ok(report.completeness > .99);
  assert.equal(report.fresh, false);
  assert.equal(hasEnoughRecurrenceHistory(report), false);
  assert.deepEqual(report.findings, []);
});


test('active recurrence result expires if market stream stops after a valid scan', () => {
  const report = findMarketRecurrences(fixture(true), FIVE_MIN, END);
  assert.equal(report.fresh, true);
  assert.equal(report.latestBarTimeMs, END - FIVE_MIN);
  assert.equal(isRecurrenceReportStale(report, END), false);
  assert.equal(isRecurrenceReportStale(report, END + FIVE_MIN * 4), false);
  assert.equal(isRecurrenceReportStale(report, END + FIVE_MIN * 6), true);
  // The original report must not be silently mutated as a side effect of UI expiration.
  assert.equal(report.fresh, true);
});

test('invalid or explicitly stale recurrence report is never treated as live', () => {
  const report = findMarketRecurrences(fixture(true), FIVE_MIN, END);
  assert.equal(isRecurrenceReportStale({ ...report, fresh: false }, END), true);
  assert.equal(isRecurrenceReportStale({ ...report, latestBarTimeMs: NaN }, END), true);
  assert.equal(isRecurrenceReportStale({ ...report, timeframeMs: 0 }, END), true);
  assert.equal(isRecurrenceReportStale(report, Number.NaN), true);
});
