import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const ctx=readFileSync(new URL('../src/context/SiteNotificationsContext.tsx',import.meta.url),'utf8');
const profile=readFileSync(new URL('../src/components/profile/ProfileNotificationSettings.tsx',import.meta.url),'utf8');
const surveillance=readFileSync(new URL('../src/context/SurveillanceContext.tsx',import.meta.url),'utf8');

test('profile notification switches persist locally without any remote writes', () => {
  assert.doesNotMatch(ctx, /apiFetch|updateProfileData|pendingSettingsWrites|settingsSaveQueue|soundSaveQueue/);
  assert.match(ctx, /localStorage\.setItem\(siteNotificationSettingsKey\(currentUid\), JSON\.stringify\(next\)\)/);
  assert.match(ctx, /localStorage\.setItem\(soundStorageKey\(currentUid\), String\(allowed\)\)/);
  assert.match(ctx, /localStorage\.setItem\(siteNotificationMuteKey\(currentUid\)/);
  assert.doesNotMatch(profile, /[Tt]elegram/);
});

test('migration uses legacy account settings only when local data is absent', () => {
  assert.match(ctx, /if \(source === null\) source = currentProfile \?\? null/);
  assert.match(ctx, /if \(localConfig === null && profile\.siteNotificationSettings\)/);
  assert.match(ctx, /if \(localSound === null && typeof profile\.soundAlertsEnabled === 'boolean'\)/);
  assert.match(ctx, /localStorage\.setItem\(siteNotificationSettingsKey\(uid\), JSON\.stringify\(migrated\)\)/);
});

test('surveillance browser keeps SSE without duplicate fallback requests', () => {
  assert.match(surveillance, /if \(streamConnected\.current \|\| \(typeof document !== 'undefined' && document\.hidden\)\) return/);
  assert.match(surveillance, /const keepSurveillanceSSE = shouldConnectSurveillanceSSE\(/);
  assert.match(surveillance, /if \(!keepSurveillanceSSE \|\| !user\?\.uid\)/);
  assert.match(surveillance,/subscribeUserSignalStream\(user\.uid/);
});
