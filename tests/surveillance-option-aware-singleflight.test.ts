import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeSurveillanceCheckOptions,
  ScopedSurveillanceChecks,
  type SurveillanceCheckOptions,
} from '../server/surveillance/scopedChecks';

test('legacy boolean true really enables fresh exchange candles, and forceNotify implies a refresh', () => {
  assert.deepEqual(normalizeSurveillanceCheckOptions(false), { forceCheck: false, forceNotify: false });
  assert.deepEqual(normalizeSurveillanceCheckOptions(true), { forceCheck: true, forceNotify: false });
  assert.deepEqual(normalizeSurveillanceCheckOptions({ forceCheck: true }), { forceCheck: true, forceNotify: false });
  assert.deepEqual(normalizeSurveillanceCheckOptions({ forceNotify: true }), { forceCheck: true, forceNotify: true });
});

test('manual refresh waits for background scan instead of silently sharing weaker options', async () => {
  let releaseBackground!: () => void;
  const started: SurveillanceCheckOptions[] = [];
  const checks = new ScopedSurveillanceChecks<string, string>(async (_coin, options) => {
    started.push(options);
    if (!options.forceCheck)
      await new Promise<void>(resolve => { releaseBackground = resolve; });
    return options.forceNotify ? 'notified' : options.forceCheck ? 'refreshed' : 'background';
  });
  const background = checks.check('coin-a', 'BTCUSDT', false);
  assert.equal(started.length, 1, 'initial scan must begin synchronously');
  const manual = checks.check('coin-a', 'BTCUSDT', { forceCheck: true });
  assert.strictEqual(checks.check('coin-a', 'BTCUSDT', true), manual,
    'same manual mode must coalesce before it runs');
  const forceNotify = checks.check('coin-a', 'BTCUSDT', { forceNotify: true });
  assert.strictEqual(checks.check('coin-a', 'BTCUSDT', { forceCheck: true }), forceNotify,
    'weaker requests can reuse the already-queued stronger refresh');
  assert.deepEqual(started, [{ forceCheck: false, forceNotify: false }],
    'no concurrent fetch may run for one coin');
  releaseBackground();
  assert.equal(await background, 'background');
  assert.equal(await manual, 'refreshed');
  assert.equal(await forceNotify, 'notified');
  assert.deepEqual(started, [
    { forceCheck: false, forceNotify: false },
    { forceCheck: true, forceNotify: false },
    { forceCheck: true, forceNotify: true },
  ]);
});

test('failed background scan does not poison a waiting explicit manual refresh', async () => {
  let fail!: (err: Error) => void;
  const started: SurveillanceCheckOptions[] = [];
  const checks = new ScopedSurveillanceChecks<string, number>(async (_coin, options) => {
    started.push(options);
    if (!options.forceCheck) return new Promise<number>((_, reject) => { fail = reject; });
    return 42;
  });
  const background = checks.check('coin-b', 'ETHUSDT');
  const manual = checks.check('coin-b', 'ETHUSDT', true);
  fail(new Error('exchange outage'));
  await assert.rejects(background, /exchange outage/);
  assert.equal(await manual, 42);
  assert.deepEqual(started, [
    { forceCheck: false, forceNotify: false },
    { forceCheck: true, forceNotify: false },
  ]);
  assert.equal(await checks.check('coin-b', 'ETHUSDT', true), 42,
    'settled flights should be cleared so a future refresh can run');
});

test('different owner and coin IDs do not collide or share a global lock', async () => {
  const keys = [JSON.stringify(['alice:bob', 'coin']), JSON.stringify(['alice', 'bob:coin'])];
  let firstRelease!: () => void;
  const started: string[] = [];
  const checks = new ScopedSurveillanceChecks<string, string>(async (name) => {
    started.push(name);
    if (name === 'a') await new Promise<void>(resolve => { firstRelease = resolve; });
    return name;
  });
  const a = checks.check(keys[0], 'a');
  const b = checks.check(keys[1], 'b');
  assert.deepEqual(started, ['a', 'b'], 'different owners are never globally serialized');
  assert.equal(await b, 'b');
  firstRelease();
  assert.equal(await a, 'a');
});

test('surveillance service uses isolated keys and normalizes legacy boolean options', () => {
  const src = readFileSync(new URL('../server/surveillanceService.ts', import.meta.url), 'utf8');
  assert.match(src, /new ScopedSurveillanceChecks<SurveillanceCoin, SurveillanceCheckResult>/);
  assert.match(src, /JSON\.stringify\(\[requestedCoin\.userId, requestedCoin\.id\]\)/);
  assert.match(src, /return checkFlights\.check\(key, requestedCoin, options\)/);
  assert.match(src, /const \{ forceCheck, forceNotify \} = options/);
  assert.doesNotMatch(src, /const existing = checkFlights\.get\(key\)/);
});
