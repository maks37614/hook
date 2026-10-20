import test from 'node:test';
import assert from 'node:assert/strict';
import { AlertSyncGuard } from '../src/utils/alertSync';
import type { PriceAlert } from '../src/types';

const alert = (id: string, userId?: string) => ({ id, userId, symbol: 'BTCUSDT' } as PriceAlert);

test('late sync responses cannot restore alerts after deletion or a new manual action', () => {
  const guard = new AlertSyncGuard();
  guard.setUser('alice');
  const old = guard.request();
  guard.remove(['deleted']);
  assert.equal(guard.accept(old), false);
  assert.deepEqual(guard.filter([alert('deleted', 'alice'), alert('kept', 'alice')]).map(a => a.id), ['kept']);
  const beforeCreate = guard.request();
  guard.invalidate();
  assert.equal(guard.accept(beforeCreate), false);
  assert.equal(guard.accept(guard.request()), true);
});

test('older responses cannot overwrite a newer accepted sync result', () => {
  const guard = new AlertSyncGuard();
  guard.setUser('alice');
  const first = guard.request();
  const second = guard.request();
  assert.equal(guard.accept(second), true);
  assert.equal(guard.accept(first), false);
});

test('account changes reject old sessions even after signing back into the same account', () => {
  const guard = new AlertSyncGuard();
  guard.setUser('alice');
  const beforeSignOut = guard.request();
  guard.remove(['same-id']);
  guard.setUser('bob');
  assert.equal(guard.accept(beforeSignOut), false);
  assert.deepEqual(guard.filter([alert('alice-only', 'alice'), alert('same-id', 'bob')]).map(a => a.id), ['same-id']);
  guard.setUser('alice');
  assert.equal(guard.accept(beforeSignOut), false);
  guard.setUser(null);
  assert.deepEqual(guard.filter([alert('anything')]), []);
});

test('account-scoped legacy records remain readable without admitting foreign or duplicate alerts', () => {
  const guard = new AlertSyncGuard();
  guard.setUser('alice');
  assert.deepEqual(guard.filter([alert('legacy'), alert('owned', 'alice'), alert('owned', 'alice'), alert('foreign', 'bob')]),
    [alert('legacy', 'alice'), alert('owned', 'alice')]);
});
