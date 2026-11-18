/**
 * Offline CPU-only microbenchmark of the browser recurrence algorithm.
 * No exchange API, WebSocket, database, auth or server requests.
 *
 * Run: node --import tsx scripts/benchmark-market-recurrence.ts 4
 *      node --import tsx scripts/benchmark-market-recurrence.ts 36
 *
 * 36 cases model sequential use of the shared Worker; they DO NOT measure
 * browser Canvas FPS, WebSocket latency, or VPS concurrent-user capacity.
 */
import { performance } from 'node:perf_hooks';
import {
  findMarketRecurrences, type RecurrenceBar,
} from '../src/components/hookchart/marketRecurrence';

const charts = Number(process.argv[2] ?? 4);
if (!Number.isInteger(charts) || charts < 1 || charts > 36) {
  console.error('Usage: benchmark-market-recurrence.ts <charts 1..36>');
  process.exitCode = 2;
} else {
  const stepMs = 300_000;
  const endMs = Date.UTC(2026, 10, 17, 20);
  const bars = 2016;
  const startMs = endMs - bars * stepMs;

  function generate(seed: number): RecurrenceBar[] {
    let number = seed;
    return Array.from({ length: bars }, (_, i) => {
      number = (Math.imul(number, 1664525) + 1013904223) >>> 0;
      const noisy = number / 4294967296;
      const spike = i % 12 === (seed % 12) || noisy > .987;
      return {
        t: startMs + i * stepMs,
        o: 100, h: spike ? 103 : 100.14,
        l: spike ? 99.8 : 99.90,
        c: spike ? 102.4 : 100.02,
        v: spike ? 1_200 : 100,
      };
    });
  }

  const input = Array.from({ length: charts }, (_, i) => generate(17 + i));
  findMarketRecurrences(input[0], stepMs, endMs); // JIT warm-up
  const samples: number[] = [];
  const startHeap = process.memoryUsage().heapUsed;
  for (const rows of input) {
    const started = performance.now();
    findMarketRecurrences(rows, stepMs, endMs);
    samples.push(performance.now() - started);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const round = (n: number) => Math.round(n * 10) / 10;
  console.log(JSON.stringify({
    kind: 'offline-cpu-only', charts, barsPerChart: bars,
    totalMs: round(samples.reduce((a, b) => a + b, 0)),
    meanMs: round(samples.reduce((a, b) => a + b, 0) / charts),
    p95Ms: round(sorted[Math.ceil(sorted.length * .95) - 1]),
    maxMs: round(sorted.at(-1)!),
    heapDeltaMiB: round((process.memoryUsage().heapUsed - startHeap) / 1048576),
    warning: 'Node CPU microbenchmark; not browser FPS or VPS capacity',
  }, null, 2));
}
