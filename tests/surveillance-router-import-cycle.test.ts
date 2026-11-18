import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { StateMachineAndAlerts } from '../server/surveillance/stateMachineAndAlerts';

test('surveillance alert formatter is importable on its own without manager initialization cycle', () => {
  // In the old dependency graph a standalone import threw
  // ReferenceError: Cannot access 'StateMachineAndAlerts' before initialization.
  const alerts = new StateMachineAndAlerts();
  assert.equal(typeof alerts.formatDensityMessage, 'function');
  assert.equal(typeof alerts.formatDensityAppearedMessage, 'function');
});

test('router coin-owner validation uses the persisted resolver and fails closed if absent', () => {
  const router = readFileSync(new URL('../server/notificationRouter.ts', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../server/surveillanceService.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(router, /from ['"]\.\/surveillanceService['"]/,
    'do not import the heavyweight surveillance service during alert formatter startup');
  assert.match(router, /persistedSurveillanceCoinLookup\?\.\(params\.coin\.id, params\.userId\) \?\? null/);
  assert.match(router, /if \(!coin\) return \{ allowed: false, reason: 'coin_removed'/);
  assert.match(service, /registerSurveillanceCoinLookup\(\(id, userId\) => findSurveillanceCoinById\(id, userId\)\?\.coin \?\? null\)/);
});
