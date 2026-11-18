import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SurveillanceCoin } from '../src/types';

test('reading a surveillance list reuses existing workers and does not spawn guest streams', async () => {
  const originalCwd = process.cwd();
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'h00k-surveillance-list-'));
  // The manager imports surveillanceService, whose data path is fixed at
  // module initialization. Change cwd BEFORE either module is loaded.
  process.chdir(fixture);
  const originalStart = await import('../server/surveillance/surveillanceManager');
  const manager = originalStart.surveillanceManager;
  const startWorker = manager.startWorkerForCoin;
  const getWorker = manager.getWorker;
  const getSnapshot = manager.getWorkerSnapshot;
  const running = new Map<string, any>();
  const launches: string[] = [];
  try {
    const service = await import('../server/surveillanceService');
    const config = service.getDefaultSurveillanceConfig();
    const sample = (userId: string, id: string, isActive: boolean): SurveillanceCoin => ({
      id, userId, isActive, symbol: 'BTCUSDT', baseAsset: 'BTC',
      quoteAsset: 'USDT', exchange: 'binance', marketType: 'futures',
      config, createdAt: '', updatedAt: '',
    });
    const storeFile = path.join(fixture, 'server/data/surveillance.json');
    fs.mkdirSync(path.dirname(storeFile), { recursive: true });
    fs.writeFileSync(storeFile, JSON.stringify({
      guest: [sample('guest', 'guest-market', true)],
      alice: [sample('alice', 'active-market', true), sample('alice', 'paused-market', false)],
    }));
    manager.startWorkerForCoin = ((coin: SurveillanceCoin) => {
      const key = JSON.stringify([coin.userId, coin.id]);
      launches.push(key);
      const worker = { coin };
      running.set(key, worker);
      return worker;
    }) as typeof manager.startWorkerForCoin;
    manager.getWorker = ((id: string, userId: string) =>
      running.get(JSON.stringify([userId, id]))) as typeof manager.getWorker;
    manager.getWorkerSnapshot = (() => null) as typeof manager.getWorkerSnapshot;

    assert.equal(service.loadSurveillanceList('guest').length, 1);
    assert.equal(launches.length, 0, 'anonymous list reads must not create market sockets');
    assert.deepEqual(service.loadSurveillanceList('alice').map(coin => coin.id),
      ['active-market', 'paused-market']);
    assert.equal(launches.length, 1, 'only the missing active owner worker starts');

    for (let i = 0; i < 15; i++) service.loadSurveillanceList('alice');
    assert.equal(launches.length, 1, 'polling GET must not reconfigure an existing worker');
    running.clear();
    service.loadSurveillanceList('alice');
    assert.equal(launches.length, 2, 'a genuinely missing authenticated worker is recovered');
    assert.ok(launches.every(key => key === JSON.stringify(['alice', 'active-market'])));
    assert.equal(service.loadSurveillanceList('unknown').length, 0);
    assert.equal(launches.length, 2);
  } finally {
    manager.startWorkerForCoin = startWorker;
    manager.getWorker = getWorker;
    manager.getWorkerSnapshot = getSnapshot;
    process.chdir(originalCwd);
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
