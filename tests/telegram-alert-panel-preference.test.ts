import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readTelegramAlertPanelCollapsed,
  saveTelegramAlertPanelCollapsed,
  telegramAlertPanelStorageKey,
  telegramAlertPanelPendingKey,
  isTelegramAlertPanelSyncPending,
  saveTelegramAlertPanelSyncPending,
} from '../src/utils/telegramAlertPanelPreference';

test('Telegram price-alert panel defaults expanded and uses one key for all coins and routes', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
  };
  const uid = 'trader-123';
  assert.equal(readTelegramAlertPanelCollapsed(storage, uid), false);
  const key = telegramAlertPanelStorageKey(uid);
  assert.ok(key.includes('telegram-price-alert-panel'));
  saveTelegramAlertPanelCollapsed(storage, true, uid);
  assert.equal(store.get(key), 'true');
  assert.equal(readTelegramAlertPanelCollapsed(storage, uid), true);
  // The preference is intentionally independent of symbol, formation and timeframe.
  assert.equal(readTelegramAlertPanelCollapsed(storage, uid), true);
  saveTelegramAlertPanelCollapsed(storage, false, uid);
  assert.equal(readTelegramAlertPanelCollapsed(storage, uid), false);
});

test('different signed-in accounts and guests do not share collapse state', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
  };
  saveTelegramAlertPanelCollapsed(storage, true, 'account-a');
  assert.equal(readTelegramAlertPanelCollapsed(storage, 'account-a'), true);
  assert.equal(readTelegramAlertPanelCollapsed(storage, 'account-b'), false);
  assert.equal(readTelegramAlertPanelCollapsed(storage), false);
  saveTelegramAlertPanelCollapsed(storage, true);
  assert.equal(readTelegramAlertPanelCollapsed(storage), true);
  assert.notEqual(telegramAlertPanelStorageKey(), telegramAlertPanelStorageKey('account-a'));
});

test('blocked browser storage does not crash the Telegram alert panel', () => {
  const broken = {
    getItem: (_key: string): string | null => { throw new Error('blocked'); },
    setItem: (_key: string, _value: string): void => { throw new Error('blocked'); },
  };
  assert.equal(readTelegramAlertPanelCollapsed(broken, 'trader-123'), false);
  assert.doesNotThrow(() => saveTelegramAlertPanelCollapsed(broken, true, 'trader-123'));
  assert.equal(readTelegramAlertPanelCollapsed(null), false);
  assert.doesNotThrow(() => saveTelegramAlertPanelCollapsed(null, false));
});

test('failed server sync keeps the last browser preference until a successful save', () => {
  const cache = new Map<string, string>();
  const storage = {
    getItem: (key: string) => cache.get(key) ?? null,
    setItem: (key: string, value: string) => { cache.set(key, value); },
    removeItem: (key: string) => { cache.delete(key); },
  };
  const uid = 'trader-123';
  saveTelegramAlertPanelCollapsed(storage, true, uid);
  saveTelegramAlertPanelSyncPending(storage, uid, true);
  assert.equal(isTelegramAlertPanelSyncPending(storage, uid), true);
  assert.equal(readTelegramAlertPanelCollapsed(storage, uid), true);
  assert.equal(cache.get(telegramAlertPanelPendingKey(uid)), 'true');
  assert.equal(isTelegramAlertPanelSyncPending(storage, 'another-trader'), false);
  saveTelegramAlertPanelSyncPending(storage, uid, false);
  assert.equal(isTelegramAlertPanelSyncPending(storage, uid), false);
  assert.equal(readTelegramAlertPanelCollapsed(storage, uid), true);
});
