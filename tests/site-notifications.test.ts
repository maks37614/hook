import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_SITE_NOTIFICATIONS, ImpulseTracker, normalizeImpulseSymbol,
  normalizeSiteNotificationSettings, notificationEnabled,
  readNotificationItems, siteNotificationSettingsKey, siteNotificationStorageKey,
  siteNotificationMuteKey, applyLocalNotificationMute,
} from '../src/utils/siteNotifications';

test('notification categories have independent opt-out and a master disable', () => {
  const defaults = normalizeSiteNotificationSettings(null);
  assert.deepEqual(defaults, DEFAULT_SITE_NOTIFICATIONS);
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.optedIn, false);
  assert.equal(defaults.enabledAt, 0);
  for (const type of ['price', 'formation', 'impulse', 'volatility', 'surveillance', 'density', 'round', 'composite', 'system'] as const)
    assert.equal(notificationEnabled(defaults, type), false, 'all default categories must be silent');
  const legacy = normalizeSiteNotificationSettings({ enabled: true, price: true, formations: true, impulses: true });
  assert.equal(legacy.enabled, false, 'legacy implicit opt-in never turns notifications on');
  assert.equal(notificationEnabled(legacy, 'price'), false);
  const opted = normalizeSiteNotificationSettings({
    optedIn: true, enabled: true, price: true, formations: true, impulses: true, surveillance: true,
  });
  assert.equal(notificationEnabled(opted, 'price'), true);
  assert.equal(normalizeSiteNotificationSettings({ ...opted, enabledAt: 123456 }).enabledAt, 123456);
  assert.equal(notificationEnabled(opted, 'formation'), true);
  assert.equal(notificationEnabled(opted, 'impulse'), true);
  assert.equal(notificationEnabled(opted, 'volatility'), true);
  assert.equal(notificationEnabled(opted, 'surveillance'), true);
  assert.equal(notificationEnabled({ ...opted, price: false }, 'price'), false);
  assert.equal(notificationEnabled({ ...opted, price: false }, 'formation'), true);
  const muted = normalizeSiteNotificationSettings({ ...opted, enabled: false });
  for (const type of ['price', 'formation', 'impulse', 'surveillance'] as const)
    assert.equal(notificationEnabled(muted, type), false);
});

test('impulse symbol and threshold inputs are normalized and bounded', () => {
  assert.equal(normalizeImpulseSymbol('btc'), 'BTCUSDT');
  assert.equal(normalizeImpulseSymbol('BTC/USDT'), 'BTCUSDT');
  assert.equal(normalizeImpulseSymbol('solusdt'), 'SOLUSDT');
  assert.equal(normalizeImpulseSymbol(''), '');
  assert.equal(normalizeImpulseSymbol('<script>'), '');
  assert.equal(normalizeSiteNotificationSettings({ impulseThresholdPct: -1 }).impulseThresholdPct, 0.1);
  assert.equal(normalizeSiteNotificationSettings({ impulseThresholdPct: 900 }).impulseThresholdPct, 50);
  assert.equal(normalizeSiteNotificationSettings({ sound: 'pulse', impulseWindowMinutes: 15 }).sound, 'pulse');
  assert.equal(normalizeSiteNotificationSettings({ sound: 'pulse', impulseWindowMinutes: 15 }).impulseWindowMinutes, 15);
  assert.notEqual(siteNotificationStorageKey('u1'), siteNotificationStorageKey('u2'));
  assert.notEqual(siteNotificationSettingsKey('u1'), siteNotificationSettingsKey('u2'));
});

test('rolling impulse detector uses observed short-window prices, both directions and cooldown', () => {
  const tracker = new ImpulseTracker(1);
  assert.equal(tracker.push(100, 100_000, 2), null);
  assert.equal(tracker.push(100.3, 106_000, 2), null);
  const impulse = tracker.push(103, 111_000, 2);
  assert.ok(impulse);
  assert.equal(impulse?.kind, 'impulse');
  assert.equal(impulse?.changePct, 3);
  assert.equal(impulse?.baselinePrice, 100);
  assert.equal(tracker.push(96, 122_000, 2), null, 'no flood before cooldown');
  assert.equal(tracker.push(97, 172_000, 2), null, 'old anchor expired without reaching threshold');
  const decline = tracker.push(92, 183_000, 2);
  assert.ok(decline);
  assert.ok((decline?.changePct || 0) < 0, 'downward impulse is recorded with a negative value');
  assert.equal(tracker.push(Number.NaN, 194_000, 2), null);
});

test('range-only volatility is detected despite a flat net price move', () => {
  const tracker = new ImpulseTracker(1);
  assert.equal(tracker.push(100, 100_000, 2), null);
  assert.equal(tracker.push(103, 105_000, 2), null); // require 10 seconds of observed history
  const spike = tracker.push(100, 111_000, 2);
  assert.ok(spike);
  assert.equal(spike?.kind, 'volatility');
  assert.equal(spike?.changePct, 0);
  assert.equal(spike?.rangePct, 3);
  assert.equal(spike?.durationSeconds, 11);
  assert.equal(tracker.push(104, 115_000, 2), null, 'cooldown covers both volatility and impulses');
});

test('notification history never reads another account and rejects invalid local entries', () => {
  const raw = JSON.stringify([
    { id: 'e1', kind: 'impulse', title: 'BTC', description: 'Move', timestamp: 1_700_000_000_000, read: false },
    { id: 'e2', kind: 'unsupported', title: 'Other', description: 'Bad', timestamp: 1, read: false },
  ]);
  const values = readNotificationItems(raw);
  assert.equal(values.length, 1);
  assert.equal(values[0].id, 'e1');
  assert.equal(values[0].read, false);
  assert.deepEqual(readNotificationItems('not-json'), []);
});

test('header opens site event center and profile exposes notification settings', () => {
  const header = readFileSync(new URL('../src/components/Header.tsx', import.meta.url), 'utf8');
  const profile = readFileSync(new URL('../src/components/UserProfileModal.tsx', import.meta.url), 'utf8');
  const alerts = readFileSync(new URL('../src/context/AlertsContext.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(header, /<SiteNotificationBell onOpenSettings=/);
  assert.doesNotMatch(header, /id="toggle-sound-btn"/);
  assert.match(profile, /activeProfileSection === 'notifications'/);
  assert.match(profile, /<ProfileNotificationSettings/);
  assert.doesNotMatch(alerts, /playAlertChime\(\)/);
  assert.match(app, /reportStrongFormations\(data\.data/);
});

test('master opt-out revokes browser push without affecting independent Telegram pages', () => {
  const active = normalizeSiteNotificationSettings({
    optedIn: true, enabled: true, enabledAt: 100,
    price: true, impulses: true, browserPush: true, telegramEnabled: true,
  });
  assert.equal(active.browserPush, true);
  assert.equal(active.telegramEnabled, false, 'legacy flag stays off for site-only notifications');
  const disabled = normalizeSiteNotificationSettings({ ...active, enabled: false });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.browserPush, false);
  assert.equal(disabled.telegramEnabled, false);
  assert.equal(notificationEnabled(disabled, 'price'), false);
  assert.equal(notificationEnabled(disabled, 'impulse'), false);
  assert.equal(disabled.price, true, 'categories can remain selected while master stays off');
  const renewed = normalizeSiteNotificationSettings({ ...disabled, enabled: true, enabledAt: 300 });
  assert.equal(renewed.browserPush, false, 're-enabling the center must not reactivate browser pushes automatically');
  assert.equal(renewed.telegramEnabled, false, 'the site center never enables independent Telegram');
});

test('a mute stored in another tab wins over an older enabled profile snapshot', () => {
  const oldProfile = normalizeSiteNotificationSettings({
    optedIn: true, enabled: true, enabledAt: 1000,
    price: true, browserPush: true, telegramEnabled: true,
  });
  const muted = applyLocalNotificationMute(oldProfile, 1001);
  assert.equal(muted.enabled, false);
  assert.equal(muted.browserPush, false);
  assert.equal(muted.telegramEnabled, false);
  assert.equal(notificationEnabled(muted, 'price'), false);
  assert.equal(applyLocalNotificationMute(oldProfile, 0).enabled, true);
  assert.equal(applyLocalNotificationMute({ ...oldProfile, enabledAt: 2000 }, 1001).enabled, true);
  assert.notEqual(siteNotificationMuteKey('user-a'), siteNotificationMuteKey('user-b'));
});

test('browser notifications, sounds, old price toasts and cross-tab state are all gated by master opt-out', () => {
  const provider = readFileSync(new URL('../src/context/SiteNotificationsContext.tsx', import.meta.url), 'utf8');
  const profile = readFileSync(new URL('../src/components/profile/ProfileNotificationSettings.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(provider, /window\.addEventListener\('storage', onStorage\)/);
  assert.match(provider, /locallyMutedAt\(uidRef\.current\)/);
  assert.match(provider, /if \(!notificationEnabled\(settingsRef\.current, event\.kind\)\) return/);
  assert.match(provider, /soundEnabledRef\.current = false/);
  assert.match(provider, /updatePreferences\(\{ soundAlertsEnabled: false \}\)/);
  assert.match(provider, /localStorage\.setItem\(siteNotificationMuteKey\(currentUid\)/);
  assert.match(provider, /browserPush && typeof document/);
  assert.match(provider, /visibleBrowserNotificationsRef\.current\.add\(visible\)/);
  assert.match(provider, /notification\.close\(\)/);
  assert.match(provider, /if \(disabling\) \{\s*closeVisibleBrowserNotifications\(\)/);
  assert.match(provider, /if \(!fromStorage\.enabled\) \{\s*closeVisibleBrowserNotifications\(\)/);
  assert.doesNotMatch(provider, /apiFetch\('\/api\/notification-preferences'/);
  assert.match(provider, /localStorage\.setItem\(siteNotificationSettingsKey\(currentUid\)/);
  assert.match(profile, /settingsRef\.current\.enabled \|\| !settingsRef\.current\.optedIn/);
  assert.match(app, /if \(!notificationEnabled\(notificationSettings, 'price'\)\) return;/);
  assert.match(app, /setAlertToast\(null\)/);
});
