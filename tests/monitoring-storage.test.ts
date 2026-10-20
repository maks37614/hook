import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getMonitoringDataDirectory, ensureMonitoringDataDirectory, writeMonitoringJson } from '../server/monitoringStorage';

const root = fs.mkdtempSync(path.join(process.cwd(), '.test-monitoring-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));

test('monitoring uses DATA_DIR or the Railway volume instead of the deployment checkout', () => {
  const checkout = path.join(root, 'checkout');
  const volume = path.join(root, 'volume');
  assert.equal(getMonitoringDataDirectory({ DATA_DIR: volume, RAILWAY_VOLUME_MOUNT_PATH: '/unused' }, checkout), volume);
  assert.equal(getMonitoringDataDirectory({ RAILWAY_VOLUME_MOUNT_PATH: volume }, checkout), volume);
  assert.equal(getMonitoringDataDirectory({}, checkout), path.join(checkout, 'server/data'));
  writeMonitoringJson(path.join(checkout, 'server/data/alerts.json'), [{ id: 'old-repository-record' }]);
  ensureMonitoringDataDirectory(volume);
  assert.equal(fs.existsSync(path.join(volume, 'alerts.json')), false, 'never seed a volume from a repository snapshot');
});

test('existing volume records and an explicitly cleared list are preserved', () => {
  const directory = path.join(root, 'existing');
  writeMonitoringJson(path.join(directory, 'alerts.json'), []);
  writeMonitoringJson(path.join(directory, 'user_telegram.json'), { 'fixture-user': { language: 'uk' } });
  ensureMonitoringDataDirectory(directory);
  assert.deepEqual(read(path.join(directory, 'alerts.json')), []);
  assert.deepEqual(read(path.join(directory, 'user_telegram.json')), { 'fixture-user': { language: 'uk' } });
});

test('a new process never reimports bootstrap data after records were cleared or files removed', () => {
  const directory = path.join(root, 'restart');
  ensureMonitoringDataDirectory(directory);
  writeMonitoringJson(path.join(directory, 'alerts.json'), []);
  // No history file exists in the new volume; an old env snapshot must not create one.
  const moduleUrl = new URL('../server/monitoringStorage.ts', import.meta.url).href;
  const startupUrl = new URL('../server/storage.ts', import.meta.url).href;
  const script = `const storage = await import(${JSON.stringify(moduleUrl)});
    const startup = await import(${JSON.stringify(startupUrl)});
    startup.initializeDataDirectory();
    if (startup.DATA_DIR !== storage.getMonitoringDataDirectory()) throw new Error('Stores use different volumes');
    storage.ensureMonitoringDataDirectory(storage.getMonitoringDataDirectory());`;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    env: { ...process.env, DATA_DIR: directory, BOOTSTRAP_ALERTS_JSON: '[{"id":"old"}]', BOOTSTRAP_HISTORY_JSON: '[{"id":"old-history"}]' },
    encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(read(path.join(directory, 'alerts.json')), []);
  assert.equal(fs.existsSync(path.join(directory, 'alert_history.json')), false);
});

test('atomic monitoring writes keep deletion records together with the current empty list', () => {
  const directory = path.join(root, 'atomic');
  const alerts = path.join(directory, 'alerts.json');
  writeMonitoringJson(alerts, [{ id: 'deleted' }]);
  writeMonitoringJson(path.join(directory, 'deleted_alerts.json'), ['alice:deleted']);
  writeMonitoringJson(alerts, []);
  assert.deepEqual(read(alerts), []);
  assert.deepEqual(read(path.join(directory, 'deleted_alerts.json')), ['alice:deleted']);
  assert.equal(fs.readdirSync(directory).some(file => file.endsWith('.tmp')), false);
});
