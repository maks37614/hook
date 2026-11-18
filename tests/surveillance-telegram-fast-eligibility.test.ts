import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CoinWorker } from '../server/surveillance/coinWorker';

function fakeWorker(config: Record<string, unknown>, active = true) {
  const worker = Object.create(CoinWorker.prototype) as CoinWorker;
  Object.assign(worker, {
    coin: { id: 'owner-coin', userId: 'owner', symbol: 'BTCUSDT', isActive: active, config },
    isDestroyed: false,
  });
  return worker;
}

test('24/7 realtime Telegram fast gate respects active, trigger mode and category settings', () => {
  const enabled = fakeWorker({ telegramEnabled: true, triggerModes: ['realtime'] });
  for (const category of ['STRUCTURE', 'THIRD_TOUCH', 'DENSITY', 'OI_ANOMALY', 'SETUP'])
    assert.equal(enabled.canDispatchTelegramAlert(category), true);
  const inactive = fakeWorker({ telegramEnabled: true, triggerModes: ['realtime'] }, false);
  assert.equal(inactive.canDispatchTelegramAlert('SETUP'), false);
  const userDisabled = fakeWorker({ telegramEnabled: false, triggerModes: ['realtime'] });
  assert.equal(userDisabled.canDispatchTelegramAlert('DENSITY'), false);
  const barCloseOnly = fakeWorker({ telegramEnabled: true, triggerModes: ['bar_close'] });
  assert.equal(barCloseOnly.canDispatchTelegramAlert('STRUCTURE'), false);
  assert.equal(fakeWorker({ telegramEnabled: true }).canDispatchTelegramAlert('OI_ANOMALY'), false);
  const denyCategories = fakeWorker({
    telegramEnabled: true, triggerModes: ['realtime'], oiAlerts: false,
    densityAlerts: false, thirdTouchAlerts: false, setupsEnabled: false,
    structureEnabled: false,
  });
  for (const category of ['STRUCTURE', 'THIRD_TOUCH', 'DENSITY', 'OI_ANOMALY', 'SETUP'])
    assert.equal(denyCategories.canDispatchTelegramAlert(category), false);
});

test('all six costly Telegram formatter calls are gated before creation, without suppressing local UI events', () => {
  const source = readFileSync(new URL('../server/surveillance/coinWorker.ts', import.meta.url), 'utf8');
  const rules: Array<[string, string]> = [
    ['STRUCTURE', 'formatStructureMessage'],
    ['THIRD_TOUCH', 'formatThirdTouchMessage'],
    ['OI_ANOMALY', 'formatOIMessage'],
    ['DENSITY', 'formatDensityAppearedMessage'],
    ['DENSITY', 'formatDensityMessage'],
    ['SETUP', 'formatSetupAlertMessage'],
  ];
  for (const [category, formatter] of rules) {
    const gate = `if (this.canDispatchTelegramAlert('${category}')) {`;
    const pos = source.indexOf('this.alertManager.' + formatter + '(');
    assert.ok(pos !== -1, formatter + ' must remain available');
    const preceding = source.slice(Math.max(0, pos - 230), pos);
    assert.ok(preceding.includes(gate), formatter + ' is evaluated before eligibility');
  }
  assert.equal((source.match(/notificationRouter\.dispatch\(\{/g) || []).length, 6);
  // Personal event history is not filtered by Telegram settings: local
  // chart/surveillance events still appear even when sending is disabled.
  assert.ok((source.match(/this\.addEvent\(\{/g) || []).length >= 4);
});
