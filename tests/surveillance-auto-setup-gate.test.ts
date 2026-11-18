import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AutoSetupGroupGate } from '../server/surveillance/autoSetupGroupGate';

test('auto setup Entry/TP/SL group is checked once per confirmed setup and worker', () => {
  const alice = new AutoSetupGroupGate();
  const bob = new AutoSetupGroupGate();
  let callsA = 0;
  let callsB = 0;
  const writeA = () => { callsA++; return { success: true }; };
  const writeB = () => { callsB++; return { success: true }; };
  assert.equal(alice.ensure('BTCUSDT_LONG_1h', writeA), true);
  for (let tick = 0; tick < 100; tick++) {
    assert.equal(alice.ensure('BTCUSDT_LONG_1h', writeA), false);
  }
  assert.equal(callsA, 1, 'repeated 6-second analysis must not hit the alert store');
  assert.equal(bob.ensure('BTCUSDT_LONG_1h', writeB), true);
  assert.equal(callsB, 1, 'different owners retain independent per-worker caches');
  assert.equal(alice.ensure('BTCUSDT_SHORT_1h', writeA), true);
  assert.equal(callsA, 2, 'a genuinely new setup still creates its three alerts');
});

test('failed validation and disk writes do not block later setup retry', () => {
  const gate = new AutoSetupGroupGate();
  let calls = 0;
  const invalid = () => { calls++; return { success: false }; };
  assert.equal(gate.ensure('new-setup', invalid), false);
  assert.equal(gate.ensure('new-setup', invalid), false);
  assert.equal(gate.size(), 0);
  assert.equal(calls, 2);

  assert.throws(() => gate.ensure('new-setup', () => {
    calls++;
    throw new Error('disk rename failed');
  }), /disk rename failed/);
  assert.equal(gate.size(), 0);
  assert.equal(gate.ensure('new-setup', () => { calls++; return { success: true }; }), true);
  assert.equal(gate.ensure('new-setup', invalid), false);
  assert.equal(calls, 4);
  assert.equal(gate.size(), 1);
});

test('completed groups are periodically reconciled after external alert resets', () => {
  const gate = new AutoSetupGroupGate(256, 15 * 60_000);
  let checks = 0;
  const storeCheck = () => { checks++; return { success: true }; };
  assert.equal(gate.ensure('resumable-setup', storeCheck, 100_000), true);
  for (let tick = 1; tick < 150; tick++) {
    assert.equal(gate.ensure('resumable-setup', storeCheck, 100_000 + tick * 6000), false);
  }
  assert.equal(checks, 1, 'six-second updates do not cause a persistence lookup');
  assert.equal(gate.ensure('resumable-setup', storeCheck, 100_000 + 15 * 60_000), true,
    'an unchanged setup is eventually reconciled with the source-of-truth alert store');
  assert.equal(checks, 2);
  assert.equal(gate.ensure('resumable-setup', storeCheck, 100_000 + 15 * 60_000 + 6000), false);
  assert.equal(gate.ensure('resumable-setup', storeCheck, 1), true,
    'a backwards clock adjustment does not suppress checks indefinitely');
  assert.throws(() => new AutoSetupGroupGate(1, 0), /at least one second/);
});

test('bounded worker cache cannot accumulate unlimited historic setup IDs', () => {
  const gate = new AutoSetupGroupGate(3);
  let writes = 0;
  const write = () => { writes++; return { success: true }; };
  for (const id of ['A','B','C','D']) assert.equal(gate.ensure(id, write), true);
  assert.equal(gate.size(), 3);
  assert.equal(gate.ensure('B', write), false, 'a recently confirmed setup is still cached');
  assert.equal(gate.ensure('A', write), true,
    'evicted old setup falls back to durable idempotent group creation');
  assert.equal(gate.size(), 3);
  assert.equal(writes, 5);
  gate.clear();
  assert.equal(gate.size(), 0);
  assert.throws(() => new AutoSetupGroupGate(0), /positive integer/);
  assert.throws(() => gate.ensure('', write), /identity/);
});

test('CoinWorker only caches successful automatic setup group persistence and cleans up on destroy', () => {
  const source = fs.readFileSync(new URL('../server/surveillance/coinWorker.ts', import.meta.url), 'utf8');
  assert.match(source, /private readonly autoSetupGroups = new AutoSetupGroupGate\(\)/);
  assert.match(source, /this\.autoSetupGroups\.ensure\(setup\.id, \(\) =>[\s\S]*?createSetupAlertsGroup\(this\.coin\.userId, setup, price, true\)/);
  assert.match(source, /if \(this\.coin\.config\?\.autoSetupsAlerts\)/);
  assert.match(source, /this\.autoSetupGroups\.clear\(\)/);
  assert.doesNotMatch(source, /\n\s*createSetupAlertsGroup\(this\.coin\.userId, setup, price, true\);/,
    'unbounded per-tick setup group writes must not remain');
});
