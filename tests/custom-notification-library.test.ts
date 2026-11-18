import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_CUSTOM_SOUND_TRACKS, customSoundDisplayName, normalizeCustomSoundLibrary,
  validateCustomNotificationSound,
} from '../src/utils/customNotificationSound';

const userFiles = [
  ['jg-032316-sfx-robot-talk-1(1).mp3', 'Голос робота'],
  ['23ab89dc95700ba(1).mp3', 'Цифровий сигнал 1'],
  ['1c0ccd2e60335f6(1).mp3', 'Цифровий сигнал 2'],
  ['magical_sound_freetone.org(1).mp3', 'Магічне сповіщення'],
  ['59f4c8e1df6982a(2).mp3', 'Цифровий сигнал 3'],
  ['e28ae0d18cb8813(2).mp3', 'Цифровий сигнал 4'],
  ['whistle_of_a_bird_freetone.org(1).mp3', 'Пташиний свист'],
  ['4f16c5e4d065268(1).mp3', 'Цифровий сигнал 5'],
] as const;

test('all eight uploaded MP3s have readable Ukrainian names without publishing audio to the server', () => {
  for (const [file, name] of userFiles) {
    assert.equal(customSoundDisplayName(file), name);
    assert.equal(validateCustomNotificationSound({ name: file, size: 50_000, type: 'audio/mpeg' }), null);
  }
  assert.ok(MAX_CUSTOM_SOUND_TRACKS >= 8);
  assert.equal(customSoundDisplayName('my-alarm.mp3'), 'my-alarm');
});

test('a previously saved single custom melody migrates safely into the library', () => {
  const audio = new Blob(['old audio'], { type: 'audio/mpeg' });
  const legacy = normalizeCustomSoundLibrary({ name: 'old.mp3', blob: audio, savedAt: 123 });
  assert.equal(legacy.version, 2);
  assert.equal(legacy.tracks.length, 1);
  assert.equal(legacy.selectedId, 'legacy');
  assert.strictEqual(legacy.tracks[0].blob, audio);
});

test('multi-track library preserves all tracks and selected audio across reads', () => {
  const tracks = userFiles.map(([name], i) => ({
    id: String(i), name, blob: new Blob(['audio'], { type: 'audio/mpeg' }), savedAt: 123 + i,
  }));
  const library = normalizeCustomSoundLibrary({ version: 2, tracks, selectedId: '6' });
  assert.equal(library.tracks.length, 8);
  assert.equal(library.selectedId, '6');
  const fallback = normalizeCustomSoundLibrary({ tracks, selectedId: 'invalid' });
  assert.equal(fallback.selectedId, '0');
  assert.deepEqual(normalizeCustomSoundLibrary({ tracks: [], selectedId: 'bad' }).tracks, []);
});

test('profile supports importing multiple sounds without altering mute or Telegram', () => {
  const profile = readFileSync(new URL('../src/components/profile/ProfileNotificationSettings.tsx', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../src/utils/customNotificationSound.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(profile, /type="file"|saveCustomNotificationSounds|uploadPersonalSound/);
  assert.match(profile, /value="alert35"/);
  assert.match(profile, /selectCustomNotificationSound\(soundUid, id\)/);
  assert.match(profile, /removeCustomNotificationSound\(soundUid, selectedPersonalId\)/);
  assert.ok(/aria-label="Вибрати одну зі своїх мелодій"/.test(profile) ||
    /aria-label=\{translatePhrase\(language, ["']Вибрати одну зі своїх мелодій["']\)\}/.test(profile),
    'saved-sound picker must retain an accessible label, translated when available');
  assert.match(profile, /playSiteNotificationSound\(settings\.sound, soundUid\)/);
  assert.match(service, /const issue = validateCustomNotificationSound\(file\)/);
  assert.match(service, /await checkAudioDuration\(files\[i\]\)/);
  assert.match(service, /await write\(uid, \{ version: 2, selectedId: added\[0\]\.id/);
  assert.doesNotMatch(service, /fetch\(|uploadBytes|firebase/);
  assert.doesNotMatch(profile, /update\(\{\s*enabled:\s*true/);
});
