import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SurveillanceCoin } from '../src/types';

test('corrupt surveillance JSON never gets replaced with an empty account store', async () => {
  // The service resolves its data path at import time. Keep every operation
  // in an isolated temporary directory, never the developer or VPS data.
  const oldCwd = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'h00k-surveillance-recovery-'));
  const dataDir = path.join(dir, 'server', 'data');
  const originalRename = fs.renameSync;
  fs.mkdirSync(dataDir, { recursive: true });
  const storePath = path.join(dataDir, 'surveillance.json');
  process.chdir(dir);
  try {
    const service = await import('../server/surveillanceService');
    const broken = '{not valid JSON';
    fs.writeFileSync(storePath, broken);
    assert.throws(() => service.loadSurveillanceStore());
    assert.throws(() => service.saveSurveillanceList('user-a', []));
    assert.equal(fs.readFileSync(storePath, 'utf8'), broken,
      'an unreadable 24/7 store must not be truncated by a user edit');

    // I/O failures (including a directory in place of the JSON file) are
    // not equivalent to a missing store and cannot be silently discarded.
    fs.rmSync(storePath);
    fs.mkdirSync(storePath);
    assert.throws(() => service.loadSurveillanceStore(), /EISDIR/);
    fs.rmSync(storePath, { recursive: true });

    // Valid JSON with invalid shape is just as unsafe as malformed syntax.
    const invalidAccount = JSON.stringify({ 'user-a': { invalid: 'not a list' } });
    fs.writeFileSync(storePath, invalidAccount);
    assert.throws(() => service.loadSurveillanceStore(), /must contain a coin list/);
    assert.equal(fs.readFileSync(storePath, 'utf8'), invalidAccount);

    const invalidCoin = JSON.stringify({ 'user-a': [null] });
    fs.writeFileSync(storePath, invalidCoin);
    assert.throws(() => service.loadSurveillanceStore(), /malformed coin/);
    assert.equal(fs.readFileSync(storePath, 'utf8'), invalidCoin);

    // An old store can have copied IDs and wrong owners. Migration stages all
    // changes before an atomic rename, leaving the original intact if it fails.
    const coin = (userId: string, symbol: string) => ({
      id: 'duplicate-id', userId, symbol, exchange: 'binance', marketType: 'futures',
      baseAsset: 'BTC', quoteAsset: 'USDT', isActive: false,
      createdAt: '2026-11-14T00:00:00.000Z', updatedAt: '2026-11-14T00:00:00.000Z',
      config: service.getDefaultSurveillanceConfig(),
    } as SurveillanceCoin);
    const original = JSON.stringify({
      'user-a': [coin('old-guest', 'BTCUSDT')],
      'user-b': [coin('user-b', 'ETHUSDT')],
      ['__proto__']: [coin('legacy-owner', 'SOLUSDT')],
    });
    fs.writeFileSync(storePath, original);

    fs.renameSync = ((src: fs.PathLike, dest: fs.PathLike) => {
      if (String(dest) === storePath) throw new Error('simulated disk rename failure');
      return originalRename(src, dest);
    }) as typeof fs.renameSync;
    assert.throws(() => service.loadSurveillanceStore(), /Failed to persist migrated/);
    assert.equal(fs.readFileSync(storePath, 'utf8'), original,
      'failed migration cannot rewrite the original account data');

    fs.renameSync = originalRename;
    const restored = service.loadSurveillanceStore();
    assert.equal(restored['user-a'].length, 1);
    assert.equal(restored['user-b'].length, 1);
    assert.equal(restored['__proto__'].length, 1);
    assert.equal(restored['__proto__'][0].userId, '__proto__');
    assert.equal(restored['user-a'][0].userId, 'user-a');
    assert.notEqual(restored['user-a'][0].id, restored['user-b'][0].id);
    assert.equal(restored['user-a'][0].symbol, 'BTCUSDT');
    assert.equal(restored['user-b'][0].symbol, 'ETHUSDT');
    const saved = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    assert.deepEqual(Object.keys(saved).sort(), ['__proto__', 'user-a', 'user-b']);
    assert.equal(saved['user-a'][0].userId, 'user-a');
    assert.notEqual(saved['user-a'][0].id, saved['user-b'][0].id);
    assert.equal(saved['__proto__'][0].userId, '__proto__');

    // Once the repaired source is loaded, explicit edits still work.
    const updated = service.loadSurveillanceList('user-a');
    updated[0].config.cooldownMinutes = 22;
    assert.equal(service.saveSurveillanceList('user-a', updated), true);
    assert.equal(service.loadSurveillanceList('user-a')[0].config.cooldownMinutes, 22);
    assert.equal(service.loadSurveillanceList('user-b')[0].symbol, 'ETHUSDT');
  } finally {
    fs.renameSync = originalRename;
    process.chdir(oldCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
