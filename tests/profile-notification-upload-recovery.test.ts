import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('custom MP3 upload validates input before IndexedDB and has bounded storage waits', () => {
  const service = read('../src/utils/customNotificationSound.ts');
  assert.match(service, /const STORAGE_TIMEOUT_MS = 8_000/);
  assert.match(service, /request\.onblocked = \(\) => fail/);
  assert.match(service, /if \(finished\) \{ request\.result\.close\(\); return; \}/);
  assert.match(service, /tx\.abort\(\)/);
  assert.match(service, /setTimeout\(\(\) => \{/);
  const upload = service.slice(service.indexOf('export async function saveCustomNotificationSounds'));
  assert.ok(upload.indexOf('const issue = validateCustomNotificationSound(file)') < upload.indexOf('const library = await read(uid)'));
  assert.match(upload, /onProgress\?\.\(i \+ 1, files\.length\)/);
  assert.match(upload, /await checkAudioDuration\(files\[i\]\)/);
});

test('MP3 decoder cleans up without recursively calling audio.load on cleanup', () => {
  const service = read('../src/utils/customNotificationSound.ts');
  const section = service.slice(service.indexOf('function checkAudioDuration'), service.indexOf('export async function getCustomNotificationSound'));
  assert.match(section, /audio\.onloadedmetadata/);
  assert.match(section, /audio\.pause\(\)/);
  assert.match(section, /URL\.revokeObjectURL\(url\)/);
  assert.doesNotMatch(section, /audio\.removeAttribute\('src'\);\s*audio\.load\(\)/);
  assert.match(section, /clearTimeout\(timeout\)/);
});

test('upload displays progress, recovers from failures and modal provides visible fallback', () => {
  const profile = read('../src/components/profile/ProfileNotificationSettings.tsx');
  const modal = read('../src/components/UserProfileModal.tsx');
  const boundary = read('../src/components/profile/ProfileNotificationsErrorBoundary.tsx');
  assert.doesNotMatch(profile, /saveCustomNotificationSounds|type="file"|soundProgress|uploadPersonalSound/);
  assert.match(profile, /soundChosen: true/);
  assert.match(profile, /soundError && <p role="alert"/);
  assert.match(modal, /<ProfileNotificationsErrorBoundary onClose=\{onClose\}>/);
  assert.match(boundary, /getDerivedStateFromError\(\)/);
  assert.match(boundary, /Закрити профіль/);
});
