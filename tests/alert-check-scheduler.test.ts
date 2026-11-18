import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AlertCheckScheduler } from '../server/alertCheckScheduler';

test('manual check waits for a busy global price check instead of reporting false success', async () => {
  let releaseGlobal!: () => void;
  const started: Array<string | undefined> = [];
  const gate = new AlertCheckScheduler(async owner => {
    started.push(owner);
    if (!owner) await new Promise<void>(resolve => { releaseGlobal = resolve; });
  });

  const background = gate.check();
  assert.deepEqual(started, [undefined], 'the scheduled check starts synchronously');
  await gate.check(); // scheduled overlap skips rather than duplicate fetch
  const manual = gate.check('user-a');
  assert.equal(gate.check('user-a'), manual, 'same-owner manual requests coalesce');
  await gate.check(); // scheduled work yields to the queued user
  assert.deepEqual(started, [undefined], 'manual check does not overlap network fetch');
  assert.equal(gate.stats().queuedManualOwners, 1);

  releaseGlobal();
  await background;
  await manual;
  assert.deepEqual(started, [undefined, 'user-a']);
  assert.equal(gate.stats().manualStarted, 1);
  assert.equal(gate.stats().manualCoalesced, 1);
  assert.equal(gate.stats().backgroundSkipped, 2);
  assert.equal(gate.stats().queuedManualOwners, 0);
});

test('different accounts are serialized, bounded and never starve each other', async () => {
  let releaseFirst!: () => void;
  const started: string[] = [];
  const gate = new AlertCheckScheduler(async owner => {
    started.push(owner!);
    if (owner === 'first') await new Promise<void>(resolve => { releaseFirst = resolve; });
  }, 2);

  const first = gate.check('first');
  const second = gate.check('second');
  await assert.rejects(gate.check('third'), /Черга ручних перевірок зайнята/);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(started, ['first'], 'only first account starts while it is pending');
  await gate.check(); // background yields to the queued owners
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(started, ['first', 'second']);
  assert.equal(gate.stats().manualRejected, 1);
  assert.equal(gate.stats().queuedManualOwners, 0);
  assert.equal(gate.stats().running, false);
});

test('one failed account and one failed global pass do not poison future manual checks', async () => {
  const started: Array<string | undefined> = [];
  const gate = new AlertCheckScheduler(async owner => {
    started.push(owner);
    if (owner === 'first' || !owner) throw new Error('provider unavailable');
  });
  await assert.rejects(gate.check(), /provider unavailable/);
  const first = gate.check('first');
  const second = gate.check('second');
  await assert.rejects(first, /provider unavailable/);
  await second;
  assert.deepEqual(started, [undefined, 'first', 'second']);
  await gate.check('third');
  assert.equal(gate.stats().queuedManualOwners, 0);
  assert.equal(gate.stats().running, false);
});

test('price alert service uses gate and operator stats expose no user identifiers', () => {
  const service = readFileSync(new URL('../server/alertService.ts', import.meta.url), 'utf8');
  const ops = readFileSync(new URL('../server/opsMetrics.ts', import.meta.url), 'utf8');
  assert.match(service, /new AlertCheckScheduler\(checkAlertsInternal\)/);
  assert.match(service, /alertCheckScheduler\.check\(userId\)/);
  assert.match(ops, /priceAlertChecks: priceAlertCheckStats\(\)/);
  const routes = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const manual = routes.slice(routes.indexOf("app.post('/api/cron/run'"),
    routes.indexOf("app.post('/api/cron/test-alert'"));
  assert.match(manual, /err instanceof AlertManualQueueBusyError/);
  assert.match(manual, /status\(503\)\.setHeader\('Retry-After', '5'\)/);
  const gate = new AlertCheckScheduler(async () => {});
  assert.deepEqual(Object.keys(gate.stats()).sort(), [
    'backgroundSkipped', 'backgroundStarted', 'manualCoalesced',
    'manualRejected', 'manualStarted', 'maxPendingManual',
    'queuedManualOwners', 'running',
  ].sort());
});
