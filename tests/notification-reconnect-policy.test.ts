import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('notification impulse threshold slider does not reopen exchange trade WebSocket', () => {
  const client = readFileSync(
    new URL('../src/context/SiteNotificationsContext.tsx', import.meta.url), 'utf8');
  const part = client.split('// One direct WS per selected coin')[1]
    ?.split('// Explicit opt-in chart-feed liquidation monitor')[0];
  assert.ok(part, 'impulse WS must remain isolated from liquidation subscriber');
  assert.match(part, /tracker\.push\(price, now, settingsRef\.current\.impulseThresholdPct\)/);
  const dependencies = part.slice(part.lastIndexOf('settings.impulseExchange'));
  assert.doesNotMatch(dependencies, /settings\.impulseThresholdPct/);
  assert.match(part, /Math\.random\(\)/, 'retries must avoid synchronized reconnect storms');
  assert.match(part, /if \(!Number\.isFinite\(price\) \|\| price <= 0\) return;/);
  assert.match(part, /retries = 0;/, 'only valid trade data resets the failure budget');
});

test('liquidation notification WS is live-only and does not reconnect on USD threshold', () => {
  const client = readFileSync(
    new URL('../src/context/SiteNotificationsContext.tsx', import.meta.url), 'utf8');
  const part = client.split('// Explicit opt-in chart-feed liquidation monitor')[1];
  assert.ok(part);
  assert.match(part, /url\.searchParams\.set\('live', '1'\)/);
  const deps = part.slice(part.lastIndexOf('settings.impulseExchange'));
  assert.doesNotMatch(deps, /settings\.liquidationMinUsd/);
});
