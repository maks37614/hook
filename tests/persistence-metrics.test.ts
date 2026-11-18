import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PersistenceMetrics } from '../server/persistenceMetrics';

test('operator persistence counters expose durations and sizes, never private records', () => {
  const metrics = new PersistenceMetrics();
  metrics.record('alerts', 8, 1200, true);
  metrics.record('alerts', 12, 350, false);
  metrics.record('surveillance', 100, 64000, true);
  const rows = metrics.stats();
  assert.deepEqual(rows.alerts, {
    writes: 2, failures: 1, avgDurationMs: 10,
    maxDurationMs: 12, lastDurationMs: 12, totalBytes: 1200, lastBytes: 350,
  });
  assert.equal(rows.surveillance.maxDurationMs, 100);
  assert.equal(rows.alertHistory.writes, 0);
  assert.ok(!JSON.stringify(rows).includes('userId'));
});

test('durable alert history writes a temp file before an atomic rename', () => {
  const source = readFileSync(new URL('../server/alertService.ts', import.meta.url), 'utf8');
  const history = source.slice(source.indexOf('export function saveHistory('),
    source.indexOf('/** Completed alert cycles'));
  assert.match(history, /writePrivateJsonAtomic\(HISTORY_FILE, payload\)/);
  assert.ok(history.indexOf('writePrivateJsonAtomic(HISTORY_FILE, payload)') <
    history.indexOf('historyCache = items'),
    'memory must not claim the alert has been persisted before rename succeeds');
  const atomic = readFileSync(new URL('../server/privateAtomicJson.ts', import.meta.url), 'utf8');
  assert.match(atomic, /fs\.constants\.O_EXCL/);
  assert.match(atomic, /fs\.writeFileSync\(fd, payload/);
  assert.match(atomic, /fs\.fsyncSync\(fd\)/);
  assert.match(atomic, /fs\.renameSync\(temporary, destination\)/);
  assert.ok(atomic.indexOf('fs.fsyncSync(fd)') <
    atomic.indexOf('fs.renameSync(temporary, destination)'),
    'private writes must be synced before atomic publication');
  const operator = readFileSync(new URL('../server/opsMetrics.ts', import.meta.url), 'utf8');
  assert.match(operator, /persistence: persistenceMetrics\.stats\(\)/);
});
