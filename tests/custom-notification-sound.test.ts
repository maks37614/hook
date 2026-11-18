import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_CUSTOM_SOUND_BYTES, MAX_CUSTOM_SOUND_SECONDS, validateCustomNotificationSound,
} from '../src/utils/customNotificationSound';
import { normalizeSiteNotificationSettings, notificationEnabled } from '../src/utils/siteNotifications';

const soundFile = (name: string, size: number, type: string) =>
  ({ name, size, type } as Pick<File, 'name' | 'size' | 'type'>);

test('custom audio accepts supported short recording formats but rejects oversized, executable and empty files', () => {
  for (const [name, type] of [
    ['bell.mp3', 'audio/mpeg'],
    ['bell.wav', 'audio/wav'],
    ['bell.ogg', 'audio/ogg'],
    ['bell.m4a', 'audio/mp4'],
    ['iphone.m4a', 'audio/x-m4a'],
    ['mobile.mp3', ''],
  ]) assert.equal(validateCustomNotificationSound(soundFile(name, 8192, type)), null, name);
  assert.equal(MAX_CUSTOM_SOUND_BYTES, 2 * 1024 * 1024);
  assert.equal(MAX_CUSTOM_SOUND_SECONDS, 20);
  for (const file of [
    soundFile('danger.exe', 2048, 'application/octet-stream'),
    soundFile('script.svg', 2048, 'audio/mpeg'),
    soundFile('song.mp3', MAX_CUSTOM_SOUND_BYTES + 1, 'audio/mpeg'),
    soundFile('blank.ogg', 0, 'audio/ogg'),
    soundFile('disguised.mp3', 100, 'image/png'),
  ]) assert.notEqual(validateCustomNotificationSound(file), null, file.name);
});

test('custom sound selection never opts the user in, unmutes audio, or enables Telegram', () => {
  const defaults = normalizeSiteNotificationSettings({
    sound: 'custom', enabled: false, optedIn: false,
    impulses: true, browserPush: true, telegramEnabled: true,
  });
  assert.equal(defaults.sound, 'custom');
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.browserPush, false);
  assert.equal(defaults.telegramEnabled, false);
  assert.equal(notificationEnabled(defaults, 'impulse'), false);
});

test('personal melody is device-local, per account, with master mute and preview wired', () => {
  const service = readFileSync(new URL('../src/utils/customNotificationSound.ts', import.meta.url), 'utf8');
  const sound = readFileSync(new URL('../src/utils/domSound.ts', import.meta.url), 'utf8');
  const profile = readFileSync(new URL('../src/components/profile/ProfileNotificationSettings.tsx', import.meta.url), 'utf8');
  const provider = readFileSync(new URL('../src/context/SiteNotificationsContext.tsx', import.meta.url), 'utf8');
  assert.match(service, /indexedDB\.open\(DB_NAME, 1\)/);
  assert.match(service, /tx\.objectStore\(STORE\)\.put\(value, uid\)/);
  assert.match(service, /getCustomNotificationSound\(uid: string\)/);
  assert.doesNotMatch(service, /fetch\(|apiFetch\(|firebase|uploadBytes/);
  assert.match(service, /audio\.onloadedmetadata/);
  assert.match(service, /audio\.duration > MAX_CUSTOM_SOUND_SECONDS/);
  assert.match(sound, /preset === 'custom'/);
  assert.match(sound, /getCustomNotificationSound\(uid\)/);
  assert.match(sound, /if \(allowed && !allowed\(\)\) return/);
  assert.doesNotMatch(profile, /saveCustomNotificationSounds|type="file"|uploadPersonalSound/);
  assert.match(profile, /removeCustomNotificationSound\(soundUid, selectedPersonalId\)/);
  assert.match(profile, /playSiteNotificationSound\(settings\.sound, soundUid\)/);
  assert.match(provider, /playSiteNotificationSound\(settingsRef\.current\.sound, soundOwner/);
  assert.match(provider, /stopCustomNotificationSound\(\)/);
});
