import test from 'node:test';
import assert from 'node:assert/strict';
import { installChunkRecovery, reloadForMissingChunk } from '../src/utils/chunkRecovery';

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

test('missing lazy bundles refresh HTML once without creating a persistent reload loop', () => {
  const storage = memoryStorage();
  let reloads = 0;
  const reload = () => { reloads++; };
  assert.equal(reloadForMissingChunk(storage, reload, 100_000), true);
  assert.equal(reloadForMissingChunk(storage, reload, 100_001), false);
  assert.equal(reloadForMissingChunk(storage, reload, 159_999), false);
  assert.equal(reloadForMissingChunk(storage, reload, 160_001), true);
  assert.equal(reloads, 2);
});

test('disabled storage cannot trigger an endless refresh', () => {
  let reloads = 0;
  const storage = { getItem: () => null, setItem: () => { throw new Error('Storage unavailable'); } };
  assert.equal(reloadForMissingChunk(storage, () => { reloads++; }), false);
  assert.equal(reloads, 0);
});

test('Vite preload failures are handled only when a refresh is actually started', () => {
  const events = new EventTarget();
  let reloads = 0;
  const target = Object.assign(events, { sessionStorage: memoryStorage(), location: { reload: () => { reloads++; } } });
  const uninstall = installChunkRecovery(target as unknown as Parameters<typeof installChunkRecovery>[0]);
  const first = new Event('vite:preloadError', { cancelable: true });
  target.dispatchEvent(first);
  assert.equal(reloads, 1);
  assert.equal(first.defaultPrevented, true);
  const repeated = new Event('vite:preloadError', { cancelable: true });
  target.dispatchEvent(repeated);
  assert.equal(reloads, 1);
  assert.equal(repeated.defaultPrevented, false);
  uninstall();
  target.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
  assert.equal(reloads, 1);
});
