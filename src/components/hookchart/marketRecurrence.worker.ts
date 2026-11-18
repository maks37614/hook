/// <reference lib="webworker" />
import { findMarketRecurrences, type RecurrenceBar } from './marketRecurrence';

type Request = { id: number; rows: RecurrenceBar[]; timeframeMs: number; nowMs: number };
self.onmessage = (event: MessageEvent<Request>) => {
  const { id, rows, timeframeMs, nowMs } = event.data;
  try {
    const started = performance.now();
    const report = findMarketRecurrences(rows, timeframeMs, nowMs);
    const workerMs = performance.now() - started;
    self.postMessage({ id, report, workerMs });
  } catch {
    self.postMessage({ id, error: 'analysis-failed' });
  }
};
