import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SurveillanceCoin } from '../src/types';

test('24/7 surveillance retries a failed boot and reuses already attached workers', async () => {
  const cwd = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'h00k-surveillance-start-retry-'));
  const previousSetTimeout = globalThis.setTimeout;
  const previousConsoleError = console.error;
  const timers: Array<{ timer: ReturnType<typeof setTimeout>; fire: () => void }> = [];
  const errors: string[] = [];
  const file = path.join(dir, 'server/data/surveillance.json');
  process.chdir(dir);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"incomplete":', 'utf8');

    const { SurveillanceManager } = await import('../server/surveillance/surveillanceManager');
    const { getDefaultSurveillanceConfig } = await import('../server/surveillanceService');
    const manager = new SurveillanceManager();
    const anyManager = manager as any;

    // Capture just the slow startup retry; never wait for 30 real seconds or
    // launch live exchange streams in this isolated test.
    globalThis.setTimeout = ((callback: (...args: any[]) => void, delay?: number, ...args: any[]) => {
      const timer = previousSetTimeout(callback, delay, ...args);
      if (delay === 30_000) {
        timers.push({ timer, fire: () => {
          clearTimeout(timer);
          callback(...args);
        } });
      }
      return timer;
    }) as typeof setTimeout;
    console.error = (...args: any[]) => { errors.push(args.map(String).join(' ')); };

    manager.start();
    assert.equal(anyManager.isStarted, false,
      'a corrupted store must not permanently mark the manager as started');
    assert.equal(timers.length, 1, 'one bounded retry must be scheduled after a boot failure');
    assert.ok(anyManager.startupRetryTimer);
    assert.equal(manager.getActiveWorkerCount(), 0);
    assert.equal(fs.readFileSync(file, 'utf8'), '{"incomplete":',
      'a failed boot must not replace the original store with empty user selections');

    // Another call during the failure window must not schedule a second timer.
    manager.start();
    assert.equal(timers.length, 1);

    const makeCoin = (id: string): SurveillanceCoin => ({
      id, userId: 'owner', symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT',
      exchange: 'binance', marketType: 'futures', isActive: true,
      createdAt: '2026-11-14T00:00:00.000Z', updatedAt: '2026-11-14T00:00:00.000Z',
      config: getDefaultSurveillanceConfig(),
    });
    fs.writeFileSync(file, JSON.stringify({ owner: [makeCoin('first'), makeCoin('second')] }));

    // If one worker fails halfway through a startup, the next attempt must
    // reuse the already attached workers instead of making duplicate sockets.
    let failSecond = true;
    let constructed = 0;
    manager.startWorkerForCoin = ((coin: SurveillanceCoin) => {
      const existing = manager.getWorker(coin.id, coin.userId);
      if (existing) return existing;
      if (coin.id === 'second' && failSecond) throw new Error('transient worker startup failure');
      constructed++;
      const worker = { coin, destroy() {} };
      anyManager.workers.set(JSON.stringify([coin.userId, coin.id]), worker);
      return worker;
    }) as typeof manager.startWorkerForCoin;

    manager.start();
    assert.equal(anyManager.isStarted, false, 'partial startup must remain retryable');
    assert.equal(manager.getActiveWorkerCount(), 1, 'first worker remains safely attached');
    assert.equal(constructed, 1);
    assert.equal(timers.length, 1, 'failed partial startup reuses the existing retry timer');

    failSecond = false;
    timers[0].fire();
    assert.equal(anyManager.isStarted, true, 'the scheduled retry must finish startup after repair');
    assert.equal(anyManager.startupRetryTimer, null, 'no timer remains after recovery');
    assert.equal(manager.getActiveWorkerCount(), 2);
    assert.equal(constructed, 2, 'the existing worker is reused, never duplicated');
    manager.start();
    assert.equal(constructed, 2, 'successful start is idempotent');
    assert.equal(timers.length, 1, 'no additional timeout is scheduled after recovery');
    assert.ok(errors.some(message => message.includes('Error booting workers')));
  } finally {
    globalThis.setTimeout = previousSetTimeout;
    console.error = previousConsoleError;
    for (const item of timers) clearTimeout(item.timer);
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
