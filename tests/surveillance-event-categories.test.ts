import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SurveillanceEvent } from '../src/types';
import { translateKey } from '../src/locales';
import { countSurveillanceEventCategories, getSurveillanceEventCategory, matchesSurveillanceEventFilter } from '../src/utils/surveillanceEventCategories';
import { CoinWorker } from '../server/surveillance/coinWorker';

const event = (code: string, severity: SurveillanceEvent['severity'] = 'warning', type: SurveillanceEvent['type'] = 'risk'): SurveillanceEvent => ({
  id: code, type, severity, title: 'Translated headline', description: '', price: 100, timestamp: 123,
  details: { notificationType: code },
});

test('monitoring category matches exact server codes, not translated titles', () => {
  for (const code of ['DENSITY_APPEARED', 'DENSITY_PERSISTENT', 'DENSITY_REMOVED'])
    assert.equal(getSurveillanceEventCategory(event(code)), 'density');
  for (const code of ['LEVEL_CROSS_4H', 'FIBONACCI', 'THIRD_TOUCH_APPROACHING', 'THIRD_TOUCH_ACTIVE', 'THIRD_TOUCH_REACTION'])
    assert.equal(getSurveillanceEventCategory(event(code)), 'level');
  for (const code of ['BOS', 'CHoCH', 'STRUCTURE_SHIFT', 'CHANNEL_BREAKOUT'])
    assert.equal(getSurveillanceEventCategory(event(code)), 'structure');
  for (const code of ['SUPPORT_RETEST_CONFIRMED', 'RESISTANCE_RETEST_CONFIRMED', 'FORMATION_SETUP_CONFIRMED', 'BREAKOUT_CONFIRMED'])
    assert.equal(getSurveillanceEventCategory(event(code, 'critical', 'level')), 'setup');
  assert.equal(getSurveillanceEventCategory(event('OI_ANOMALY')), 'other');
  assert.equal(getSurveillanceEventCategory(event('', 'info', 'level')), 'level');
  const legacy = event('');
  legacy.title = 'Нова щільність BID';
  assert.equal(getSurveillanceEventCategory(legacy), 'other',
    'a translated heading must never determine the market-event category');
});

test('chip counts match their filters; critical is independent of category', () => {
  const events = [event('DENSITY_APPEARED'), event('DENSITY_PERSISTENT'),
    event('THIRD_TOUCH_APPROACHING'), event('BOS'),
    event('FORMATION_SETUP_CONFIRMED', 'critical', 'level'), event('OI_ANOMALY')];
  const totals = countSurveillanceEventCategories(events);
  assert.deepEqual(totals, { all: 6, critical: 1, level: 1, structure: 1, density: 2, setup: 1 });
  for (const filter of ['all', 'critical', 'level', 'structure', 'density', 'setup'] as const)
    assert.equal(events.filter(e => matchesSurveillanceEventFilter(e, filter)).length, totals[filter]);
  assert.equal(countSurveillanceEventCategories(events.slice(0, 2)).density, 2);
});

test('density quality, setup confluence and realtime book use four translations', () => {
  const labels = {
    uk: ['Якість', 'Конфлюенс', 'У реальному часі'],
    en: ['Quality', 'Confluence', 'Realtime order book'],
    ru: ['Качество', 'Конфлюэнс', 'В реальном времени'],
    pl: ['Jakość', 'Konfluencja', 'Arkusz w czasie rzeczywistym'],
  } as const;
  for (const lang of ['uk', 'en', 'ru', 'pl'] as const) {
    const [quality, confluence, realtime] = labels[lang];
    assert.equal(translateKey(lang, 'surveillance.ui.qualityScore'), quality);
    assert.equal(translateKey(lang, 'surveillance.ui.confluenceScore'), confluence);
    assert.equal(translateKey(lang, 'surveillance.ui.realtimeQuote'), realtime);
  }
  const page = readFileSync(new URL('../src/components/SurveillancePage.tsx', import.meta.url), 'utf8');
  assert.match(page, /countSurveillanceEventCategories\(coinEvents\)/);
  assert.match(page, /matchesSurveillanceEventFilter\(ev, eventsTypeFilter\)/);
  assert.doesNotMatch(page, /• Conf:/);
  assert.doesNotMatch(page, /ev\.title\.toLowerCase\(\)\.includes/);
});

test('persistent wall is recorded once per lifetime, including quality zero', () => {
  const worker = Object.create(CoinWorker.prototype) as any;
  worker.coin = { id: 'c1', userId: 'owner', symbol: 'BTCUSDT',
    exchange: 'binance', marketType: 'futures', isActive: true,
    config: { densityAlerts: false, telegramEnabled: false } };
  worker.streamClient = { status: 'LIVE', marketTicker: { volume24hUsd: 12_000_000 } };
  worker.isDestroyed = true;
  worker.recentEvents = [];
  worker.persistentDensityLogged = new Set();
  const wall = { side: 'BID', price: 60000, quantity: 1, notionalUsd: 60000,
    firstSeenAt: Date.now() - 70000, ageSeconds: 70,
    classification: 'PERSISTENT_LIQUIDITY', distancePct: 1.1, qualityScore: 0 };
  worker.orderBookEngine = {
    hasFreshSynchronizedDepth: () => true, pollNewlyAppearedDensities: () => [],
    getSignificantDensities: () => [wall], calculateAdaptiveThreshold: () => 25000,
  };
  worker.processDensitySignals();
  assert.equal(worker.recentEvents.length, 1);
  assert.equal(worker.recentEvents[0].type, 'DENSITY_PERSISTENT');
  assert.equal(worker.recentEvents[0].confluenceScore, 0);
  worker.processDensitySignals();
  assert.equal(worker.recentEvents.length, 1);
  const next = { ...wall, firstSeenAt: wall.firstSeenAt + 80000 };
  worker.orderBookEngine.getSignificantDensities = () => [next];
  worker.processDensitySignals();
  assert.equal(worker.recentEvents.length, 2);
  worker.orderBookEngine.hasFreshSynchronizedDepth = () => false;
  worker.processDensitySignals();
  assert.equal(worker.recentEvents.length, 2);
});
