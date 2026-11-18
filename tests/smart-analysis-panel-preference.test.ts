import test from 'node:test';
import assert from 'node:assert/strict';
import {
  smartAnalysisPanelStorageKey, readSmartAnalysisPanelCollapsed, saveSmartAnalysisPanelCollapsed,
  smartAnalysisPanelPendingKey, isSmartAnalysisPanelSyncPending, saveSmartAnalysisPanelSyncPending,
} from '../src/utils/smartAnalysisPanelPreference';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test('AI + Quant starts expanded and stays collapsed across coins, timeframes and routes', () => {
  const storage = memoryStorage();
  assert.equal(readSmartAnalysisPanelCollapsed(storage, 'user-1'), false);
  saveSmartAnalysisPanelCollapsed(storage, true, 'user-1');
  assert.equal(readSmartAnalysisPanelCollapsed(storage, 'user-1'), true);
  assert.equal(storage.values.get(smartAnalysisPanelStorageKey('user-1')), 'true');
  saveSmartAnalysisPanelCollapsed(storage, false, 'user-1');
  assert.equal(readSmartAnalysisPanelCollapsed(storage, 'user-1'), false);
});

test('AI visibility is separate between accounts, guests, and Telegram panel', () => {
  const storage = memoryStorage();
  saveSmartAnalysisPanelCollapsed(storage, true, 'user-A');
  assert.equal(readSmartAnalysisPanelCollapsed(storage, 'user-B'), false);
  assert.equal(readSmartAnalysisPanelCollapsed(storage), false);
  assert.notEqual(smartAnalysisPanelStorageKey('user-A'), smartAnalysisPanelStorageKey('user-B'));
  assert.notEqual(smartAnalysisPanelStorageKey('user-A'), 'h00k:telegram-price-alert-panel:collapsed:v1:user-A');
});

test('AI collapse state survives an unsuccessful profile write and remains local', () => {
  const storage = memoryStorage();
  const uid = 'user-A';
  saveSmartAnalysisPanelCollapsed(storage, true, uid);
  saveSmartAnalysisPanelSyncPending(storage, uid, true);
  assert.equal(storage.values.get(smartAnalysisPanelPendingKey(uid)), 'true');
  assert.equal(isSmartAnalysisPanelSyncPending(storage, uid), true);
  assert.equal(isSmartAnalysisPanelSyncPending(storage, 'user-B'), false);
  saveSmartAnalysisPanelSyncPending(storage, uid, false);
  assert.equal(isSmartAnalysisPanelSyncPending(storage, uid), false);
  assert.equal(readSmartAnalysisPanelCollapsed(storage, uid), true);
});

test('AI collapse works when localStorage access is blocked', () => {
  const broken = {
    getItem: (_key: string): string | null => { throw new Error('blocked'); },
    setItem: (_key: string, _value: string): void => { throw new Error('blocked'); },
    removeItem: (_key: string): void => { throw new Error('blocked'); },
  };
  assert.equal(readSmartAnalysisPanelCollapsed(broken, 'user-A'), false);
  assert.doesNotThrow(() => saveSmartAnalysisPanelCollapsed(broken, true, 'user-A'));
  assert.doesNotThrow(() => saveSmartAnalysisPanelSyncPending(broken, 'user-A', true));
  assert.equal(isSmartAnalysisPanelSyncPending(broken, 'user-A'), false);
});
