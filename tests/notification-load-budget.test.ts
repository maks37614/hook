import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../src/context/AlertsContext.tsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server/alertService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('alert sync is adaptive and no network request runs in a background tab', () => {
  assert.match(client, /document\.hidden\)\) return/);
  assert.match(client, /hasPendingAlerts \? 30_000 : 120_000/);
  assert.match(client, /now - lastPolledAt < minimumInterval/);
  assert.match(client, /const interval = setInterval\(\(\) => \{ void pollSync\(\); \}, 10_000\)/);
  assert.match(client, /document\.addEventListener\('visibilitychange', onVisible\)/);
  assert.match(client, /document\.removeEventListener\('visibilitychange', onVisible\)/);
  assert.doesNotMatch(client, /setInterval\(pollSync, 5000\)/);
});

test('unchanged client alert snapshots do not rewrite user-scoped local storage or invoke Firestore', () => {
  const sync = client.slice(client.indexOf('const pollSync = async'), client.indexOf('  const addAlert = useCallback'));
  assert.match(sync, /const changed = JSON\.stringify\(alertsRef\.current\) !== JSON\.stringify\(data\.alerts\)/);
  assert.match(sync, /if \(changed\) \{\s*setAlerts\(data\.alerts\)/);
  assert.match(sync, /if \(changed\) \{[\s\S]*?localStorage\.setItem\('signalhook_user_alerts_'/);
  assert.doesNotMatch(sync, /mirrorServerAlerts|onSnapshot|isFirebase|Firestore|writeBatch\(/);
});


test('unchanged server alert sync returns user data without rewriting global alert file', () => {
  const sync = server.slice(server.indexOf('export function syncUserAlerts'), server.indexOf('// Delete alert'));
  assert.match(sync, /mergedUserAlerts\.length !== existingUserAlerts\.size/);
  assert.match(sync, /JSON\.stringify\(previous\) !== JSON\.stringify\(alert\)/);
  assert.match(sync, /if \(changed\) \{[\s\S]*?persistAlertEdit\(\[\.\.\.mergedUserAlerts, \.\.\.otherAlerts\]\)/);
  assert.match(server, /export function startAlertMonitor\(intervalMs: number = 6000\)/);
});

test('hidden tabs do not run the periodic screener scan, explicit manual refresh remains available', () => {
  assert.match(app, /if \(!shouldRunStandardScan\(activePage, earlyMode, chartPageActive\)\) return;/);
  assert.match(app, /if \(document\.hidden \|\| \(!initial && Date\.now\(\) - lastRequestedAt < 50_000\)\) return;/);
  assert.match(app, /document\.addEventListener\('visibilitychange', onVisibilityChange\)/);
  // Both original and newer foreground-gated manual refresh are supported.
  const direct = /onRefresh=\{\(\) => earlyMode && activePage === 'screener' \? refreshFullEarlyScan\(\) : fetchScreenerData\(\)\}/;
  const foreground = /onRefresh=\{\(\) => \{\s*const target = foregroundScanKind\(activePage, earlyMode, chartPageActive\);\s*if \(target === 'early'\) refreshFullEarlyScan\(\);\s*else if \(target === 'regular'\) void fetchScreenerData\(\);/;
  assert.ok(direct.test(app) || foreground.test(app), 'manual refresh must choose the correct foreground scan');
});
