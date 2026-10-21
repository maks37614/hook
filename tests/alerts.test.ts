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
const service = await import('../server/alertService');
const { NotificationRouter } = await import('../server/notificationRouter');
const surveillance = await import('../server/surveillanceService');
const telegram = await import('../server/telegramService');
process.chdir(originalCwd);
test.after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));

const alert = (id: string, userId = 'test-user') => ({
  id, userId, symbol: 'BTCUSDT', exchange: 'binance' as const, marketType: 'futures' as const,
  targetPrice: 110, condition: 'gte' as const,
});

test('unchanged polling from alternating accounts preserves file order and performs no durable writes', () => {
  for (const uid of ['poll-alice', 'poll-bob']) {
    service.createAlert(alert(`alert-${uid}`, uid));
    service.syncUserAlerts(uid, service.getAllAlerts(uid), undefined, undefined, 'uk');
  }
  const before = JSON.stringify(service.loadAlerts());
  const original = fs.fsyncSync;
  let writes = 0;
  fs.fsyncSync = fd => { writes++; original(fd); };
  try {
    for (let i = 0; i < 100; i++) {
      for (const uid of ['poll-alice', 'poll-bob']) {
        service.syncUserAlerts(uid, service.getAllAlerts(uid), undefined, undefined, 'uk');
      }
    }
    assert.equal(writes, 0);
    assert.equal(JSON.stringify(service.loadAlerts()), before);
    service.syncUserAlerts('poll-alice', service.getAllAlerts('poll-alice'), undefined, undefined, 'en');
    assert.ok(writes > 0, 'a real language change is still saved');
    assert.equal(service.getUserLanguage('poll-alice'), 'en');
    assert.equal(service.getUserLanguage('poll-bob'), 'uk');
  } finally { fs.fsyncSync = original; }
});

test('a failed settings write is retried instead of being mistaken for unchanged saved settings', () => {
  service.saveUserTelegram('retry-settings', { language: 'uk' });
  const original = fs.fsyncSync;
  fs.fsyncSync = () => { throw new Error('fixture disk failure'); };
  try { assert.throws(() => service.saveUserTelegram('retry-settings', { language: 'en' }), /persist/); }
  finally { fs.fsyncSync = original; }
  assert.equal(service.getUserLanguage('retry-settings'), 'uk');
  service.saveUserTelegram('retry-settings', { language: 'en' });
  assert.equal(service.getUserLanguage('retry-settings'), 'en');
});

test('preserving global storage order still accepts a changed order within one account', () => {
  service.createAlert(alert('order-first', 'order-user'));
  service.createAlert(alert('order-second', 'order-user'));
  const selected = service.getAllAlerts('order-user').reverse();
  const otherAccounts = service.loadAlerts().filter(alert => alert.userId !== 'order-user');
  service.syncUserAlerts('order-user', selected);
  assert.deepEqual(service.getAllAlerts('order-user').map(alert => alert.id), selected.map(alert => alert.id));
  assert.deepEqual(service.loadAlerts().filter(alert => alert.userId !== 'order-user'), otherAccounts);
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

test('sync cannot copy another account alerts or duplicate repeated IDs', () => {
  const foreign = service.createAlert(alert('foreign-sync', 'original-owner'));
  const own = service.createAlert(alert('own-sync', 'current-owner'));
  const result = service.syncUserAlerts('current-owner', [foreign, own, own]);
  assert.deepEqual(result.map(a => a.id), ['own-sync']);
  assert.equal(service.getAllAlerts('original-owner').length, 1);
  assert.equal(service.getAllAlerts('current-owner').length, 1);
});

test('deletions survive a new deployment directory and old repository or bootstrap snapshots', () => {
  const volume = path.join(fixtureDir, 'mounted-volume');
  const firstDeployment = path.join(fixtureDir, 'release-one');
  const nextDeployment = path.join(fixtureDir, 'release-two');
  fs.mkdirSync(firstDeployment, { recursive: true });
  fs.mkdirSync(path.join(nextDeployment, 'server/data'), { recursive: true });
  const old = { ...alert('volume-deleted', 'volume-user'), createdAt: 1, isActive: true, triggered: false };
  fs.writeFileSync(path.join(nextDeployment, 'server/data/alerts.json'), JSON.stringify([old]));
  const moduleUrl = new URL('../server/alertService.ts', import.meta.url).href;
  const run = (cwd: string, code: string) => spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
    `const service = await import(${JSON.stringify(moduleUrl)}); ${code}`], {
    cwd, env: { ...process.env, DATA_DIR: volume, BOOTSTRAP_ALERTS_JSON: JSON.stringify([old]) },
    encoding: 'utf8', timeout: 15000,
  });
  const removed = run(firstDeployment, `
    service.createAlert(${JSON.stringify(old)});
    service.deleteAlert('volume-deleted', 'volume-user');`);
  assert.equal(removed.status, 0, removed.stderr);
  const restarted = run(nextDeployment, `
    if (service.getAllAlerts('volume-user').length) throw new Error('Repository snapshot resurrected an alert');
    if (service.syncUserAlerts('volume-user', [${JSON.stringify(old)}]).length) throw new Error('Stale sync resurrected an alert');
    service.createAlert(${JSON.stringify(alert('new-manual', 'volume-user'))});
    if (service.getAllAlerts('volume-user').length !== 1) throw new Error('Manual creation stopped working');`);
  assert.equal(restarted.status, 0, restarted.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(volume, 'deleted_alerts.json'), 'utf8')), ['volume-user:volume-deleted']);
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
  created.triggered = true;
  created.triggeredAt = 123;
  service.saveAlerts(service.loadAlerts());
  assert.equal(service.createAlert(alert(created.id, 'retry-user')).triggered, true);
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
  service.createAlert(alert('deleted-during-check'));
  globalThis.fetch = async () => new Promise<Response>(resolve => { resolvePrice = resolve; });
  try {
    const checking = service.checkAlertsOnce();
    for (let n = 0; !resolvePrice && n < 200; n++) await new Promise(resolve => setTimeout(resolve, 10));
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
  service.createAlert({ ...alert('futures-api-outage', 'outage-user'), symbol: 'OUTAGEUSDT' });
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
  service.saveUserTelegram('router-test', { botToken: '123:test-fixture', chatId: 'fixture-chat' });
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
  service.saveUserTelegram('gate-user', { botToken: '123:fixture', chatId: 'fixture-chat' });
  const router = new NotificationRouter();
  const coin: any = { id: 'gate-coin', userId: 'gate-user', symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures',
    isActive: true, config: { ...surveillance.getDefaultSurveillanceConfig(), telegramEnabled: true, triggerModes: ['realtime'], densityAlerts: true } };
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

test('surveillance Telegram events require explicit opt-in without creating price alerts', () => {
  service.saveUserTelegram('opt-in-user', { botToken: '123:opt-in', chatId: 'opt-in-chat' });
  const router = new NotificationRouter();
  const coin: any = { id: 'opt-in-coin', userId: 'opt-in-user', symbol: 'BTCUSDT',
    exchange: 'binance', marketType: 'futures', isActive: true,
    config: { ...surveillance.getDefaultSurveillanceConfig(), triggerModes: ['realtime'] } };
  const payload: any = { source: 'SURVEILLANCE', userId: coin.userId, coinId: coin.id, coin,
    symbol: coin.symbol, exchange: coin.exchange, marketType: coin.marketType,
    eventType: 'FORMATION_SETUP_CONFIRMED', eventIdentity: 'signal', triggerMode: 'realtime' };
  surveillance.saveSurveillanceList(coin.userId, [coin]);
  assert.equal(router.shouldNotify(payload).reason, 'telegram_disabled_for_coin');
  surveillance.saveSurveillanceList(coin.userId, [{ ...coin, config: { ...coin.config, telegramEnabled: true } }]);
  assert.equal(router.shouldNotify(payload).allowed, true);
  assert.equal(service.getAllAlerts(coin.userId).length, 0);
  surveillance.saveSurveillanceList(coin.userId, []);
});

test('a user price alert without Telegram credentials never uses the global destination', async () => {
  const originalFetch = globalThis.fetch;
  telegram.saveTelegramConfig({ botToken: '999:global-fixture', chatId: 'global-fixture-chat' });
  service.saveAlerts([]);
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
    assert.match(history[0].telegramError!, /не налаштовано/);
  } finally { globalThis.fetch = originalFetch; }
});
