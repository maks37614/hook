import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('manual CRON and dedicated surveillance full check share 60-second owner throttle', () => {
  const source = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const cron = source.slice(source.indexOf("app.post('/api/cron/run'"),
    source.indexOf("app.post('/api/cron/test-alert'"));
  const check = source.slice(source.indexOf("app.post('/api/surveillance/check-all'"),
    source.indexOf("app.post('/api/surveillance/:id/check'"));
  assert.match(cron, /const throttleKey = checksSurveillance \? 'check-all' : 'manual-price-alerts'/);
  assert.match(cron, /userWorkThrottle\.allow\(res\.locals\.userId, throttleKey, windowMs\)/);
  assert.match(cron, /status\(429\)/);
  assert.match(check, /userWorkThrottle\.allow\(uid, 'check-all', 60000\)/);
});

test('CRON inventory cannot modify the persisted legacy trigger mode configuration', () => {
  const service = readFileSync(new URL('../server/surveillanceService.ts', import.meta.url), 'utf8');
  const inventory = service.slice(service.indexOf('export function getAllActiveSurveillanceCoins'),
    service.indexOf('export function getDefaultSurveillanceConfig'));
  assert.ok(!inventory.includes('coin.config.triggerModes ='),
    'normalizing legacy defaults should not modify saved user objects');
  assert.match(inventory, /\.\.\.coin\.config/);
});

test('manual check errors are reported and cannot masquerade as successful completion', () => {
  const service = readFileSync(new URL('../server/surveillanceService.ts', import.meta.url), 'utf8');
  const block = service.slice(service.indexOf('export async function checkAllUserCoins'),
    service.indexOf('export function startSurveillanceMonitor'));
  assert.match(block, /let failedChecks = 0/);
  assert.match(block, /failedChecks\+\+/);
  assert.match(block, /if \(failedChecks\) throw new SurveillanceCheckIncompleteError/);
});
