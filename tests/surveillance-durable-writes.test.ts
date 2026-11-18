import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SurveillanceCoin } from '../src/types';

test('surveillance JSON edits commit atomically, GET snapshots never mutate stored coins', async () => {
  // Import after choosing a temporary cwd: the service resolves server/data
  // once at module initialization. Never read or change a production file.
  const previousCwd = process.cwd();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'h00k-surv-durable-'));
  process.chdir(temp);
  const originalRename = fs.renameSync;
  try {
    const service = await import('../server/surveillanceService');
    const coin = {
      id: 'surv_test_1', userId: 'user-test-1', symbol: 'BTCUSDT',
      exchange: 'binance', marketType: 'futures',
      baseAsset: 'BTC', quoteAsset: 'USDT', isActive: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      config: service.getDefaultSurveillanceConfig(),
    } as SurveillanceCoin;
    assert.equal(service.saveSurveillanceList(coin.userId, [coin]), true);
    const file = path.join(temp, 'server/data/surveillance.json');
    assert.equal(fs.statSync(file).mode & 0o777, 0o600,
      'private surveillance data must not be readable by other OS users');
    const saved = fs.readFileSync(file, 'utf8');
    const readView = service.loadSurveillanceList(coin.userId);
    readView[0].config.cooldownMinutes = 999;
    assert.equal(service.loadSurveillanceList(coin.userId)[0].config.cooldownMinutes, 15,
      'a client GET must not mutate in-memory user configuration');

    const proposed = service.loadSurveillanceList(coin.userId);
    proposed[0].config.cooldownMinutes = 888;
    fs.renameSync = (() => { throw new Error('simulated disk rename failure'); }) as typeof fs.renameSync;
    assert.equal(service.saveSurveillanceList(coin.userId, proposed), false);
    assert.equal(fs.readFileSync(file, 'utf8'), saved, 'disk copy remains unchanged');
    assert.equal(service.loadSurveillanceList(coin.userId)[0].config.cooldownMinutes, 15,
      'a failed write cannot change the in-memory source of truth');

    const checked = structuredClone(coin);
    checked.lastCheckedAt = '2026-11-14T00:00:00.000Z';
    assert.throws(() => service.commitSurveillanceCheck(checked),
      /Не вдалося зберегти стан 24\/7-нагляду/);
    assert.equal(service.loadSurveillanceList(coin.userId)[0].lastCheckedAt, undefined,
      'failed Telegram/monitor checkpoint cannot appear durably committed');

    fs.renameSync = originalRename;
    assert.equal(service.saveSurveillanceList(coin.userId, proposed), true);
    assert.equal(service.loadSurveillanceList(coin.userId)[0].config.cooldownMinutes, 888);
    assert.notEqual(fs.readFileSync(file, 'utf8'), saved);

    // A stale request must not roll back a more recent successful analysis.
    const recentCheck = '2026-11-14T12:05:00.000Z';
    const recentDelivery = '2026-11-14T12:06:00.000Z';
    const recentState = { currentPrice: 105, lastProcessedCandleTimes: {
      '15m': 105, '1h': 105, '4h': 105,
    } } as any;
    const recent = {
      ...service.loadSurveillanceList(coin.userId)[0],
      state: recentState, lastCheckedAt: recentCheck, lastNotifiedAt: recentDelivery,
    };
    assert.equal(service.commitSurveillanceCheck(recent)?.lastCheckedAt, recentCheck);
    const durableRecent = fs.readFileSync(file, 'utf8');

    const oldCheck = {
      ...recent, state: { currentPrice: 1 } as any,
      lastCheckedAt: '2026-11-14T12:04:00.000Z',
      lastNotifiedAt: '2026-11-14T12:03:00.000Z',
    };
    fs.renameSync = (() => { throw new Error('stale pass must not write'); }) as typeof fs.renameSync;
    assert.equal(service.commitSurveillanceCheck(oldCheck)?.lastCheckedAt, recentCheck);
    assert.equal(fs.readFileSync(file, 'utf8'), durableRecent,
      'an older asynchronous check must not write over a newer checkpoint');
    fs.renameSync = originalRename;
    assert.equal(service.loadSurveillanceList(coin.userId)[0].state?.currentPrice, 105);

    const latestCheck = {
      ...recent, lastCheckedAt: '2026-11-14T12:07:00.000Z',
      lastNotifiedAt: '2026-11-14T12:01:00.000Z',
      state: { currentPrice: 107 } as any,
    };
    assert.equal(service.commitSurveillanceCheck(latestCheck)?.lastNotifiedAt, recentDelivery,
      'a newer market snapshot must not rewind the notification cooldown');
    const final = service.loadSurveillanceList(coin.userId)[0];
    assert.equal(final.state?.currentPrice, 107);
    assert.equal(final.lastNotifiedAt, recentDelivery);

    // A leftover temp file from an older release may be world-readable.
    // It must be chmodded before becoming the published surveillance.json.
    fs.writeFileSync(`${file}.tmp`, 'old incomplete temp', { mode: 0o644 });
    fs.chmodSync(`${file}.tmp`, 0o644);
    assert.equal(service.saveSurveillanceList(coin.userId, [final]), true);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  } finally {
    fs.renameSync = originalRename;
    process.chdir(previousCwd);
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('surveillance route must report a persistence failure instead of false success', () => {
  const source = fs.readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const routes = source.slice(source.indexOf("app.post('/api/surveillance'"),
    source.indexOf("app.post('/api/surveillance/check-all'"));
  assert.ok(routes.includes('if (!saveSurveillanceList(uid, list))'));
  assert.ok(routes.includes('if (!saveSurveillanceList(found.userId, nextList))'));
  assert.ok(routes.includes('if (!saveSurveillanceList(found.userId, filtered))'));
  assert.match(routes, /status\(503\)/);
});
