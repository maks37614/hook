import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getAlertMirrorWrites, getAlertMirrorDeletes } from '../src/utils/alertSync';

// Isolate persistence and credentials from real application data.
const originalCwd = process.cwd();
const fixtureDir = fs.mkdtempSync(path.join(originalCwd, '.test-alerts-'));
process.chdir(fixtureDir);
process.env.TELEGRAM_BOT_TOKEN = '999:global-fixture';
const service = await import('../server/alertService');
const { NotificationRouter } = await import('../server/notificationRouter');
const surveillance = await import('../server/surveillanceService');
const users = await import('../server/userTelegram');
const notificationPrefs = await import('../server/siteNotificationPrefs');
process.chdir(originalCwd);
test.after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));

const connectUser = (userId: string, chatId: string) => {
  const bot = users.getSharedTelegramBot();
  if (!bot) throw new Error('Shared bot fixture is missing');
  users.connectUserTelegram(userId, bot.botId, chatId);
};
const allowNotifications = (uid: string, categories: Record<string, boolean>, telegramEnabled = true) => {
  notificationPrefs.saveUserSiteNotificationSettings(uid, {
    optedIn: true, enabled: true, telegramEnabled, ...categories,
  });
};
const alert = (id: string, userId = 'test-user') => ({
  id, userId, symbol: 'BTCUSDT', exchange: 'binance' as const, marketType: 'futures' as const,
  targetPrice: 110, condition: 'gte' as const,
});

test('stale client sync cannot delete server-created alerts', () => {
  service.createAlert(alert('new-on-server'));
  const merged = service.syncUserAlerts('test-user', []);
  assert.ok(merged.some(a => a.id === 'new-on-server'));
  service.deleteAlert('new-on-server', 'test-user');
  assert.equal(service.getAllAlerts('test-user').length, 0);
  assert.equal(service.syncUserAlerts('test-user', merged).length, 0);
});

test('stale sync cannot undo a manual server pause', () => {
  const created = { ...service.createAlert(alert('paused-before-sync', 'paused-user')) };
  service.toggleAlert(created.id, 'paused-user', false);
  const merged = service.syncUserAlerts('paused-user', [created]);
  assert.equal(merged[0].isActive, false);
});

test('price alert mutations require the owner and never affect another user', () => {
  const created = service.createAlert(alert('owner-only', 'owner'));
  assert.equal(service.toggleAlert(created.id), null);
  assert.equal(service.deleteAlert(created.id), false);
  assert.equal(service.toggleAlert(created.id, 'another-user'), null);
  assert.equal(service.deleteAlert(created.id, 'another-user'), false);
  assert.equal(service.getAllAlerts('owner')[0].isActive, true);
});

test('Firestore mirrors receive automatic server alerts and paused/reactivated state without write loops', () => {
  const auto = service.createAlert(alert('server-auto', 'mirror-user'));
  assert.deepEqual(getAlertMirrorWrites([auto], []), [auto]);
  assert.deepEqual(getAlertMirrorWrites([auto], [{ ...auto }]), []);
  assert.equal(getAlertMirrorWrites([{ ...auto, isActive: false }], [auto]).length, 1);
  const triggered = { ...auto, triggered: true, triggeredAt: 123, triggeredPrice: 111, isActive: false };
  assert.deepEqual(getAlertMirrorWrites([auto], [triggered]), [auto]);
  assert.deepEqual(getAlertMirrorDeletes([], [auto]), [auto.id]);
  assert.deepEqual(getAlertMirrorDeletes([auto], [auto]), []);
});

test('duplicate create requests preserve a paused or triggered alert', () => {
  const created = service.createAlert(alert('create-retry', 'retry-user'));
  service.toggleAlert(created.id, 'retry-user', false);
  assert.equal(service.createAlert(alert(created.id, 'retry-user')).isActive, false);
  assert.equal(service.createAlertsBatch('retry-user', [alert(created.id, 'retry-user')])[0].isActive, false);
  // The original object returned by createAlert is a detached snapshot:
  // mutating it must not silently edit the persisted user alert.
  created.triggered = true;
  created.triggeredAt = 123;
  assert.equal(service.getAllAlerts('retry-user')[0].triggered, false);
  const updated = service.loadAlerts().map(item =>
    item.id === created.id && item.userId === 'retry-user'
      ? { ...item, triggered: true, triggeredAt: 123, isActive: false }
      : item);
  assert.equal(service.saveAlerts(updated), true);
  assert.equal(service.createAlert(alert(created.id, 'retry-user')).triggered, true);
});


test('retrying an existing alert returns a detached snapshot, not a mutable persistence reference', () => {
  const owner = 'retry-detached-owner';
  const first = service.createAlert(alert('retry-detached', owner));
  const retry = service.createAlert(alert(first.id, owner));
  assert.notStrictEqual(retry, service.loadAlerts().find(item => item.id === first.id && item.userId === owner));

  retry.isActive = false;
  retry.triggered = true;
  retry.triggeredAt = Date.now();
  let stored = service.getAllAlerts(owner)[0];
  assert.equal(stored.isActive, true);
  assert.equal(stored.triggered, false);
  assert.equal(stored.triggeredAt, undefined);

  service.toggleAlert(first.id, owner, false);
  const pausedRetry = service.createAlert(alert(first.id, owner));
  assert.equal(pausedRetry.isActive, false);
  pausedRetry.isActive = true;
  assert.equal(service.getAllAlerts(owner)[0].isActive, false);
});

test('duplicate IDs in a client sync are merged once and cannot re-arm paused alerts', () => {
  const owner = 'sync-duplicate-owner';
  const created = service.createAlert(alert('sync-duplicate', owner));
  service.toggleAlert(created.id, owner, false);
  const staleClient = { ...created, isActive: true, triggered: false };

  const synced = service.syncUserAlerts(owner, [staleClient, { ...staleClient }]);
  assert.deepEqual(synced.map(row => row.id), ['sync-duplicate']);
  assert.equal(synced[0].isActive, false);
  assert.equal(service.getAllAlerts(owner).length, 1);
  assert.equal(service.getAllAlerts(owner)[0].isActive, false);

  const unrelated = service.createAlert(alert('sync-other', 'sync-other-owner'));
  assert.equal(service.getAllAlerts('sync-other-owner').find(row => row.id === unrelated.id)?.isActive, true);
});


test('API alert and history snapshots cannot silently change stored user state', () => {
  const owner = 'immutable-alert-snapshot';
  const created = service.createAlert(alert('immut-create', owner));
  created.isActive = false;
  assert.equal(service.getAllAlerts(owner).find(item => item.id === created.id)?.isActive, true);

  const read = service.getAllAlerts(owner);
  read[0].targetPrice = 1;
  read[0].triggered = true;
  assert.equal(service.getAllAlerts(owner)[0].targetPrice, 110);
  assert.equal(service.getAllAlerts(owner)[0].triggered, false);

  const batched = service.createAlertsBatch(owner, [alert('immut-batch', owner)]);
  batched[0].isActive = false;
  assert.equal(service.getAllAlerts(owner).find(item => item.id === 'immut-batch')?.isActive, true);

  const historyItem = {
    id: 'immut-history', userId: owner, alertId: 'immut-create',
    symbol: 'BTCUSDT', exchange: 'binance' as const, marketType: 'futures' as const,
    condition: 'gte' as const, targetPrice: 110, triggeredPrice: 120,
    triggeredAt: Date.now(), telegramSent: false,
  };
  service.addHistoryItem(historyItem);
  const history = service.getAlertHistory(owner);
  history[0].telegramSent = true;
  assert.equal(service.getAlertHistory(owner)[0].telegramSent, false);
});

test('deletion before delayed creation prevents POST and batch resurrection', () => {
  service.deleteAlert('deleted-before-create', 'delayed-user');
  assert.throws(() => service.createAlert(alert('deleted-before-create', 'delayed-user')), /видалено/);
  assert.deepEqual(service.createAlertsBatch('delayed-user', [alert('deleted-before-create', 'delayed-user')]), []);
  assert.equal(service.getAllAlerts('delayed-user').length, 0);
});

test('deleted alerts cannot be resurrected by stale sync after a server restart', () => {
  const created = { ...service.createAlert(alert('deleted-before-restart', 'restart-user')) };
  service.deleteAlert(created.id, 'restart-user');
  const moduleUrl = new URL('../server/alertService.ts', import.meta.url).href;
  const script = `const service = await import(${JSON.stringify(moduleUrl)});
    const merged = service.syncUserAlerts('restart-user', [${JSON.stringify(created)}]);
    if (merged.some(a => a.id === 'deleted-before-restart')) process.exit(1);`;
  const restarted = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    cwd: fixtureDir, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(restarted.status, 0, restarted.stderr || restarted.error?.message);
});

test('setup groups are idempotent and isolated between users', () => {
  const setup: any = { id: 'shared-setup', symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures',
    direction: 'LONG', type: 'BREAKOUT_RETEST', timeframe: '1h', entryZone: { low: 100, high: 100 },
    invalidationPrice: 95, targetPrice: 110, riskReward: 2 };
  const first = service.createSetupAlertsGroup('setup-user-a', setup, 99);
  assert.equal(first.success, true, first.error);
  service.toggleAlert('shared-setup_ENTRY', 'setup-user-a');
  service.createSetupAlertsGroup('setup-user-a', setup, 99);
  assert.equal(service.getAllAlerts('setup-user-a').find(a => a.setupRole === 'ENTRY')?.isActive, false);
  service.createSetupAlertsGroup('setup-user-b', setup, 99);
  assert.equal(service.getAllAlerts('setup-user-a').length, 3);
  assert.equal(service.getAllAlerts('setup-user-b').length, 3);
});

test('alert deleted while fetching price cannot fire or be restored', async () => {
  const originalFetch = globalThis.fetch;
  let resolvePrice!: (value: Response) => void;
  service.saveAlerts([]);
  allowNotifications('test-user', { price: true });
  service.createAlert(alert('deleted-during-check'));
  globalThis.fetch = async () => new Promise<Response>(resolve => { resolvePrice = resolve; });
  try {
    const checking = service.checkAlertsOnce();
    service.deleteAlert('deleted-during-check', 'test-user');
    resolvePrice(Response.json({ price: '120' }));
    await checking;
    assert.equal(service.getAllAlerts('test-user').length, 0);
    assert.equal(service.getAlertHistory('test-user').length, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('futures price alerts never trigger from spot or another exchange on an API outage', async () => {
  const originalFetch = globalThis.fetch;
  service.saveAlerts([]);
  allowNotifications('outage-user', { price: true }, false);
  service.createAlert(alert('futures-api-outage', 'outage-user'));
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    return url.includes('fapi.binance.com')
      ? new Response('{}', { status: 503 })
      : Response.json({ price: '999', result: { list: [{ lastPrice: '999' }] } });
  };
  try {
    await service.checkAlertsOnce();
    assert.equal(service.getAllAlerts('outage-user')[0].triggered, false);
    assert.equal(urls.length, 1);
    assert.ok(urls[0].includes('fapi.binance.com/fapi/v1/'));
  } finally { globalThis.fetch = originalFetch; }
});

test('notification dispatch deduplicates concurrent requests and respects setup switches', async () => {
  const originalFetch = globalThis.fetch;
  connectUser('router-test', '12345');
  allowNotifications('router-test', { formations: true });
  const router = new NotificationRouter();
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ ok: true, result: {} }); };
  const payload: any = { source: 'SURVEILLANCE', userId: 'router-test', coinId: 'coin',
    symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures',
    eventType: 'FORMATION_SETUP_CONFIRMED', eventIdentity: 'closed-setup', htmlMessage: 'Fixture' };
  try {
    const results = await Promise.all([router.dispatch(payload), router.dispatch(payload)]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(calls, 1);
    assert.equal(await router.dispatch(payload), false);
    const blocked = { ...payload, eventIdentity: 'other', coin: { isActive: true, config: { setupsEnabled: false } } };
    assert.equal(await router.dispatch(blocked), false);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('notifications use current pause, deletion, trigger mode and density switches', () => {
  connectUser('gate-user', '23456');
  allowNotifications('gate-user', { density: true });
  const router = new NotificationRouter();
  const coin: any = { id: 'gate-coin', userId: 'gate-user', symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures',
    isActive: true, config: { ...surveillance.getDefaultSurveillanceConfig(), triggerModes: ['realtime'], densityAlerts: true } };
  const payload: any = { source: 'ORDERBOOK', userId: coin.userId, coinId: coin.id, coin,
    symbol: coin.symbol, exchange: coin.exchange, marketType: coin.marketType,
    eventType: 'DENSITY_APPEARED', eventIdentity: 'wall', triggerMode: 'realtime' };
  surveillance.saveSurveillanceList(coin.userId, [{ ...coin, isActive: false }]);
  assert.equal(router.shouldNotify(payload).reason, 'coin_inactive');
  surveillance.saveSurveillanceList(coin.userId, [{ ...coin, config: { ...coin.config, densityAlerts: false } }]);
  assert.equal(router.shouldNotify(payload).reason, 'density_alerts_disabled');
  surveillance.saveSurveillanceList(coin.userId, [coin]);
  assert.equal(router.shouldNotify(payload).allowed, true);
  assert.equal(router.shouldNotify({ ...payload, triggerMode: 'bar_close_1h' }).reason, 'trigger_mode_disabled');
  surveillance.saveSurveillanceList(coin.userId, []);
  assert.equal(router.shouldNotify(payload).reason, 'coin_removed');
});

test('a user price alert without a Telegram link never uses a global destination', async () => {
  const originalFetch = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = '999:global-fixture';
  process.env.TELEGRAM_CHAT_ID = 'global-fixture-chat';
  service.saveAlerts([]);
  allowNotifications('unconfigured-user', { price: true });
  service.createAlert(alert('no-user-telegram', 'unconfigured-user'));
  let sends = 0;
  globalThis.fetch = async input => {
    if (String(input).includes('api.telegram.org')) sends++;
    return Response.json({ price: '120', ok: true, result: {} });
  };
  try {
    await service.checkAlertsOnce();
    assert.equal(sends, 0);
    const history = service.getAlertHistory('unconfigured-user');
    assert.equal(history.length, 1);
    assert.equal(history[0].telegramSent, false);
    assert.match(history[0].telegramError!, /не підключені/);
  } finally { globalThis.fetch = originalFetch; }
});

test('per-user alert checks retain every other user in the global WS subscription universe', async t => {
  const { publicPriceFeed } = await import('../server/publicPriceFeed');
  const originalFetch = globalThis.fetch;
  const watches: string[][] = [];
  t.mock.method(publicPriceFeed, 'watch', (items: Array<{ exchange: string; market: string; symbol: string }>) => {
    watches.push(items.map(i => `${i.exchange}:${i.market}:${i.symbol}`).sort());
  });
  service.saveAlerts([]);
  allowNotifications('user-a', { price: true });
  allowNotifications('user-b', { price: true });
  service.createAlert({ ...alert('all-users-a', 'user-a'), targetPrice: 999_999 });
  service.createAlert({ ...alert('all-users-b', 'user-b'), symbol: 'ETHUSDT', targetPrice: 999_999 });
  globalThis.fetch = async () => Response.json({ price: '100' });
  try {
    await service.checkAlertsOnce('user-a');
    assert.deepEqual(watches.at(-1), ['binance:futures:BTCUSDT', 'binance:futures:ETHUSDT']);
    await service.checkAlertsOnce('user-with-no-alerts');
    assert.deepEqual(watches.at(-1), ['binance:futures:BTCUSDT', 'binance:futures:ETHUSDT'],
      'a user without alerts must not close another user\'s public subscription');
    assert.equal(service.getAllAlerts('user-b').length, 1);
    assert.equal(service.getAllAlerts('user-b')[0].triggered, false);
  } finally {
    globalThis.fetch = originalFetch;
    service.saveAlerts([]);
  }
});
