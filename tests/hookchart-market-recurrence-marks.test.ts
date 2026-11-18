import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createMarketRecurrenceMarks,
  type RecurrenceReport, type RecurrenceFinding,
} from '../src/components/hookchart/marketRecurrence';

const END = Date.UTC(2026, 10, 18, 12);
const BASE = 300_000;
function finding(times: number[], kind: RecurrenceFinding['kind'] = 'impulse'): RecurrenceFinding {
  return {
    kind, cycle: 'hour', minute: 15, hits: times.length,
    observations: 24, holdoutHits: 3, holdoutObservations: 8,
    rate: .5, baselineRate: .1, status: 'repeat', score: 15,
    recentTimes: times,
  };
}
function report(findings: RecurrenceFinding[], timeframeMs = BASE): RecurrenceReport {
  return {
    findings, bars: 2016, coveredDays: 7, completeness: 1,
    timeframeMs, completedAt: END,
  };
}

test('a 1m chart keeps 5m source-window precision instead of inventing minute-level timing', () => {
  const time = END - 4 * BASE;
  const marks = createMarketRecurrenceMarks(report([finding([time])]));
  assert.deepEqual(marks, [{ t: time, windowMs: BASE, kind: 'impulse', status: 'repeat' }]);
});

test('markers are deduplicated across overlapping patterns and capped at 18', () => {
  const events = Array.from({ length: 6 }, (_, i) => END - (i + 10) * BASE).reverse();
  const findings = Array.from({ length: 6 }, (_, i) => finding(events.map(t => t - i * 86_400_000),
    i % 2 ? 'volume' : 'impulse'));
  const withDupes = [finding(events), finding(events), ...findings];
  const marks = createMarketRecurrenceMarks(report(withDupes));
  assert.ok(marks.length <= 18);
  assert.equal(new Set(marks.map(m => m.t + ':' + m.kind)).size, marks.length);
});

test('future, still-open and malformed source events never create markers', () => {
  const time = END - BASE;
  const marks = createMarketRecurrenceMarks(report([finding([NaN, END, time])]));
  assert.deepEqual(marks, [{ t: time, windowMs: BASE, kind: 'impulse', status: 'repeat' }]);
  assert.deepEqual(createMarketRecurrenceMarks(report([finding([time])], 0)), []);
});

test('1m chart draws a 5-minute bracket; 5m chart retains a compact event tick', () => {
  const code = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  assert.match(code, /const x=g\.x\(mark\.t\),endX=g\.x\(mark\.t\+mark\.windowMs\)/);
  assert.match(code, /if\(mark\.windowMs>intervalMs\)/);
  assert.match(code, /q\.moveTo\(left,5\);q\.lineTo\(right,5\)/);
  assert.match(code, /if\(x<5\|\|x>g\.plotW-5\)continue/);
});

test('1m precision notice is translated into all four supported languages', () => {
  const code = readFileSync(new URL('../src/components/hookchart/MarketRecurrenceTool.tsx', import.meta.url), 'utf8');
  assert.match(code, /precision: 'позначки: інтервал 5m'/);
  assert.match(code, /precision: 'marks: 5m window'/);
  assert.match(code, /precision: 'znaczniki: zakres 5m'/);
  assert.match(code, /precision: 'отметки: интервал 5m'/);
});
