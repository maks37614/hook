import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_SITE_NOTIFICATIONS, normalizeSiteNotificationSettings } from '../src/utils/siteNotifications';

const profile = readFileSync(new URL('../src/components/profile/ProfileNotificationSettings.tsx', import.meta.url), 'utf8');
const player = readFileSync(new URL('../src/utils/domSound.ts', import.meta.url), 'utf8');
const audioPath = new URL('../public/sounds/alert_35.mp3', import.meta.url);

test('bundled alert MP3 exists and has valid MP3 header', () => {
  assert.equal(existsSync(audioPath), true);
  const bytes = readFileSync(audioPath);
  assert.ok(bytes.byteLength > 4000 && bytes.byteLength < 100_000);
  assert.ok(bytes.subarray(0,3).toString() === 'ID3' || bytes[0] === 0xff);
  assert.match(player, /new Audio\('\/sounds\/alert_35\.mp3'\)/);
  assert.match(player, /if \(preset === 'alert35'\)/);
  assert.match(player, /stopCustomNotificationSound\(\)/);
});

test('bundled sound becomes default without enabling any notifications', () => {
  assert.equal(DEFAULT_SITE_NOTIFICATIONS.sound, 'alert35');
  const settings = normalizeSiteNotificationSettings(null);
  assert.equal(settings.sound, 'alert35');
  assert.equal(settings.enabled, false);
  assert.equal(settings.optedIn, false);
  assert.equal(normalizeSiteNotificationSettings({ sound:'chime' }).sound, 'alert35');
});

test('selected sounds remain selected; explicitly chosen classic chime is retained', () => {
  assert.equal(normalizeSiteNotificationSettings({ sound:'chime', soundChosen:true }).sound, 'chime');
  for (const sound of ['alert35','soft','pulse','custom'] as const) {
    assert.equal(normalizeSiteNotificationSettings({ sound }).sound, sound);
  }
  assert.match(profile, /soundChosen: true/);
});

test('profile has four builtin presets and no upload affordance', () => {
  for (const value of ['alert35','chime','soft','pulse']) assert.ok(profile.includes(`value="${value}"`));
  assert.doesNotMatch(profile, /type="file"|accept="\.mp3|uploadPersonalSound|Додати свої мелодії/);
  assert.match(profile, /Раніше збережені мелодії/);
});
