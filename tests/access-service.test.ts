import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const fixture = fs.mkdtempSync(path.join(process.cwd(), '.test-access-'));
process.env.DATA_DIR = fixture;
const { AccessService } = await import('../server/accessService');
const DAY = 86400000;
const start = Date.UTC(2026, 0, 31, 12, 30);
const make = () => {
  let now = start;
  const file = path.join(fixture, Math.random().toString(36).slice(2) + '.json');
  return { service: new AccessService(file, () => now), file, setNow: (value: number) => { now = value; } };
};
test.after(() => fs.rmSync(fixture, { recursive: true, force: true }));

test('new accounts get permanent full access immediately, with no activation code or trial', () => {
  const { service, file, setNow } = make();
  const first = service.status('alice');
  assert.equal(first.registeredAt, start);
  assert.equal(first.status, 'free');
  assert.equal(first.fullAccessUntil, null);
  assert.equal(first.hasFullAccess, true);
  assert.ok(!('trialEndsAt' in first));
  assert.ok(!('paidUntil' in first));
  setNow(start + 3650 * DAY);
  assert.equal(service.status('alice').hasFullAccess, true);
  assert.equal(service.status('alice').status, 'free');
  service.ensureMember('alice', { displayName: 'New name' });
  const restored = new AccessService(file, () => start + 5000 * DAY);
  assert.equal(restored.status('alice').registeredAt, first.registeredAt);
  assert.equal(restored.status('alice').hasFullAccess, true);
  assert.equal(service.hasFullAccess('guest'), false);
});

test('previously expired members regain permanent access without redeeming anything', () => {
  const { service, file } = make();
  service.ensureMember('old-user', { email: 'old@example.test' });
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  state.members['old-user'].trialEndsAt = start - DAY;
  state.members['old-user'].paidUntil = start - DAY;
  state.codes = [{ legacy: true }];
  fs.writeFileSync(file, JSON.stringify(state));
  const restored = new AccessService(file, () => start + 100 * DAY);
  const access = restored.status('old-user');
  assert.equal(access.status, 'free');
  assert.equal(access.hasFullAccess, true);
  assert.equal(access.fullAccessUntil, null);
  assert.ok(!('codes' in access));
});

test('administrator status is optional and does not change basic account access', () => {
  const { service, file, setNow } = make();
  assert.throws(() => service.setAdmin('unknown', true));
  service.ensureMember('owner');
  service.setAdmin('owner', true);
  setNow(start + 100 * DAY);
  assert.equal(service.status('owner').status, 'admin');
  const restored = new AccessService(file, () => start + 100 * DAY);
  assert.equal(restored.status('owner').isAdmin, true);
  restored.setAdmin('owner', false);
  assert.equal(restored.status('owner').isAdmin, false);
  assert.equal(restored.status('owner').status, 'free');
  assert.equal(restored.status('owner').hasFullAccess, true);
});

test('invalid user IDs cannot bypass authentication', () => {
  const { service } = make();
  for (const uid of ['', 'guest', '__proto__', 'constructor', 'prototype']) {
    assert.equal(service.hasFullAccess(uid), false);
    assert.throws(() => service.status(uid));
  }
});

test('corrupted account data fails closed instead of silently resetting', () => {
  const file = path.join(fixture, 'corrupt.json');
  fs.writeFileSync(file, '{bad');
  assert.throws(() => new AccessService(file).status('alice'));
  assert.equal(fs.readFileSync(file, 'utf8'), '{bad');
});
