import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SurveillanceEvent } from '../src/types';
import { classifySurveillanceEventType, normalizeSiteNotificationSettings } from '../src/utils/siteNotifications';
import { marketSurveillanceSignal, surveillanceNotificationKind } from '../src/utils/notificationSignals';
import { categoryForServerEvent } from '../server/siteNotificationPrefs';

// Codes come from server/surveillance/coinWorker and the standard surveillance scanner.
const cases = [
  ['DENSITY_APPEARED', 'density'],
  ['DENSITY_PERSISTENT', 'density'],
  ['OI_ANOMALY', 'openInterest'],
  ['VOLUME_ANOMALY', 'volume'],
  ['LEVEL_DETECTED', 'levels'],
  ['THIRD_TOUCH_APPROACHING', 'levels'],
  ['BREAKOUT_REALTIME', 'breakouts'],
  ['BREAKOUT_CONFIRMED', 'breakouts'],
  ['CHANNEL_BREAK', 'breakouts'],
  ['BOS', 'breakouts'],
  ['CHoCH', 'breakouts'],
  ['STRUCTURE_SHIFT', 'breakouts'],
  ['SUPPORT_RETEST_CONFIRMED', 'breakouts'],
  ['SUPPORT_RESISTANCE_FLIP', 'breakouts'],
  ['FORMATION_SETUP_CONFIRMED', 'formation'],
  ['IMPULSE', 'impulse'],
  ['SESSION_CHANGED', 'surveillance'],
] as const;

const allowed = (kind: string) => normalizeSiteNotificationSettings({
  optedIn: true, enabled: true,
  [kind === 'formation' ? 'formations' : kind === 'impulse' ? 'impulses' : kind]: true,
});
const example = (code: string, legacy = false): SurveillanceEvent & {
  coinId: string; symbol: string; exchange: 'binance'; marketType: 'futures';
} => ({
  id: 'worker-1', coinId: 'watch-1', symbol: 'BTCUSDT',
  exchange: 'binance', marketType: 'futures',
  type: 'level', title: code, description: 'Synthetic test event',
  timestamp: 200_000, price: 100, severity: 'warning',
  details: { timeframe: '15m', ...(legacy ? { type: code } : { notificationType: code }) },
});

test('server and browser classify the same real worker codes', () => {
  for (const [code, expected] of cases) {
    assert.equal(classifySurveillanceEventType(code), expected, code);
    assert.equal(categoryForServerEvent(code, 'SURVEILLANCE'), expected, code);
    assert.equal(surveillanceNotificationKind(example(code)), expected, code);
    assert.equal(surveillanceNotificationKind(example(code, true)), expected, code);
    assert.equal(marketSurveillanceSignal(example(code), allowed(expected))?.kind, expected, code);
  }
});
test('wrong category switches, exchange and timeframe block worker events', () => {
  const event = example('DENSITY_APPEARED');
  assert.equal(marketSurveillanceSignal(event, allowed('openInterest')), null);
  assert.equal(marketSurveillanceSignal(event,
    normalizeSiteNotificationSettings({ ...allowed('density'), scopeExchange:'bybit' })), null);
  assert.equal(marketSurveillanceSignal(event,
    normalizeSiteNotificationSettings({ ...allowed('density'), scopeTimeframe:'5m' })), null);
  assert.equal(marketSurveillanceSignal({ ...event, details:{ notificationType:'DENSITY_APPEARED' } },
    normalizeSiteNotificationSettings({ ...allowed('density'), scopeTimeframe:'15m' })), null);
});
test('unknown or incomplete codes cannot masquerade as verified exchange signals', () => {
  assert.equal(classifySurveillanceEventType(''), 'surveillance');
  assert.equal(classifySurveillanceEventType('FREEFORM'), 'surveillance');
  assert.equal(classifySurveillanceEventType({ type:'OI_ANOMALY' }), 'surveillance');
});
test('the worker-to-UI adapter preserves event code alongside chart timeframe', () => {
  const srv = readFileSync(new URL('../server/surveillanceService.ts', import.meta.url), 'utf8');
  assert.match(srv, /id: e\.eventId/);
  assert.match(srv, /notificationType: e\.type/);
  assert.match(srv, /timeframe: e\.timeframe/);
});
