import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  PROFILE_FOCUS_REFRESH_MS, PROFILE_GUEST_FOCUS_REFRESH_MS, PROFILE_SIGNAL_COALESCE_MS, PROFILE_SYNC_SIGNAL_KEY,
  isProfileSyncRelevant, parseProfileSyncSignal, publishProfileSyncSignal,
  shouldRefreshProfileOnFocus,
} from '../src/utils/profileSync';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('profile invalidation contains only a minimal bounded identifier and nonce', () => {
  const signal = parseProfileSyncSignal(JSON.stringify({
    uid: 'user-a', kind: 'profile', nonce: '123:abc',
  }));
  assert.deepEqual(signal, { uid: 'user-a', kind: 'profile', nonce: '123:abc' });
  assert.equal(isProfileSyncRelevant(signal!, 'user-a'), true);
  assert.equal(isProfileSyncRelevant(signal!, 'user-b'), false);
  assert.equal(isProfileSyncRelevant(signal!, null), false);
  assert.equal(isProfileSyncRelevant({ uid: null, kind: 'session', nonce: '123:abc' }, null), true);
  assert.equal(isProfileSyncRelevant({ uid: 'user-b', kind: 'session', nonce: '123:abc' }, 'user-a'), true);
  for (const broken of [
    null, '', 'x', 'null', '{}', '[]',
    JSON.stringify({ uid: null, kind: 'profile', nonce: 'x' }),
    JSON.stringify({ uid: 123, kind: 'profile', nonce: 'x' }),
    JSON.stringify({ uid: 'a', kind: 'password', nonce: 'x' }),
    JSON.stringify({ uid: 'a', kind: 'profile', nonce: '' }),
    JSON.stringify({ uid: 'a'.repeat(200), kind: 'profile', nonce: 'x' }),
    JSON.stringify({ uid: 'a', kind: 'profile', nonce: 'x'.repeat(91) }),
    ' '.repeat(401),
  ]) assert.equal(parseProfileSyncSignal(broken), null);
});

test('profile focus refresh is throttled; an event is not a polling timer', () => {
  assert.equal(PROFILE_FOCUS_REFRESH_MS >= 30_000, true);
  assert.ok(PROFILE_GUEST_FOCUS_REFRESH_MS >= PROFILE_FOCUS_REFRESH_MS * 3);
  assert.equal(PROFILE_SIGNAL_COALESCE_MS >= 1_000, true);
  assert.equal(shouldRefreshProfileOnFocus(100_000, 100_000 + PROFILE_FOCUS_REFRESH_MS - 1), false);
  assert.equal(shouldRefreshProfileOnFocus(100_000, 100_000 + PROFILE_FOCUS_REFRESH_MS), true);
  assert.equal(shouldRefreshProfileOnFocus(100_000, 99_999), true, 'clock adjustments permit recovery');
  assert.equal(shouldRefreshProfileOnFocus(100_000, 100_000 + PROFILE_FOCUS_REFRESH_MS, PROFILE_GUEST_FOCUS_REFRESH_MS), false);
  assert.equal(shouldRefreshProfileOnFocus(100_000, 100_000 + PROFILE_GUEST_FOCUS_REFRESH_MS, PROFILE_GUEST_FOCUS_REFRESH_MS), true);
  assert.equal(shouldRefreshProfileOnFocus(Number.NaN, 100_000), true);
});

test('signal written to browser storage contains no credentials, chart or profile data', () => {
  const original = (globalThis as any).window;
  const writes: Array<{ key: string; value: string }> = [];
  (globalThis as any).window = {
    localStorage: {
      setItem(key: string, value: string) { writes.push({ key, value }); },
    },
  };
  try {
    publishProfileSyncSignal('account-1', 'profile');
    publishProfileSyncSignal(null, 'session');
    publishProfileSyncSignal(null, 'profile'); // not a valid profile change
    assert.equal(writes.length, 2);
    for (const item of writes) {
      assert.equal(item.key, PROFILE_SYNC_SIGNAL_KEY);
      assert.deepEqual(Object.keys(JSON.parse(item.value)).sort(), ['kind', 'nonce', 'uid']);
      assert.equal(item.value.includes('csrf'), false);
      assert.equal(item.value.includes('email'), false);
      assert.ok(parseProfileSyncSignal(item.value));
    }
    assert.deepEqual(writes.map(item => parseProfileSyncSignal(item.value)?.kind), ['profile', 'session']);
  } finally {
    (globalThis as any).window = original;
  }
});

test('auth only refreshes a verified profile on foreground or another tab signal', () => {
  const auth = read('../src/context/AuthContext.tsx');
  assert.match(auth, /window\.addEventListener\('storage', onStorage\)/);
  assert.match(auth, /window\.addEventListener\('focus', onForeground\)/);
  assert.match(auth, /document\.addEventListener\('visibilitychange', onForeground\)/);
  assert.match(auth, /window\.addEventListener\('pageshow', onForeground\)/);
  assert.match(auth, /document\.visibilityState === 'hidden'/);
  assert.match(auth, /PROFILE_SIGNAL_COALESCE_MS/);
  assert.match(auth, /shouldRefreshProfileOnFocus\(lastSessionCheckRef\.current, Date\.now\(\),/);
  assert.match(auth, /PROFILE_GUEST_FOCUS_REFRESH_MS/);
  assert.match(auth, /await writeQueue\.current\.catch\(\(\) => \{\}\)/);
  assert.match(auth, /profileWriteSequenceRef\.current/);
  assert.match(auth, /identityEpochRef\.current/);
  assert.match(auth, /fetch\('\/api\/auth\/session', \{/);
  assert.match(auth, /credentials: 'same-origin', cache: 'no-store'/);
  assert.match(auth, /if \(response\.status === 401\)/);
  assert.match(auth, /if \(!response\.ok\) return/);
  assert.match(auth, /setApiIdentity\(expectedUid, String\(payload\.csrf\)\)/);
  assert.match(auth, /publishProfileSyncSignal\(account\.uid, 'profile'\)/);
  assert.match(auth, /publishProfileSyncSignal\(null, 'session'\)/);
  assert.doesNotMatch(auth, /setInterval\(/);
  assert.doesNotMatch(auth, /new WebSocket\(/);
});

test('account form reflects remote changes without overwriting the user’s dirty inputs', () => {
  const profile = read('../src/components/UserProfileModal.tsx');
  assert.match(profile, /const touchedFields = useRef\(newTouchedFields\(\)\)/);
  assert.match(profile, /if \(isNewAccount \|\| !touchedFields\.current\.defaultExchange\)/);
  assert.match(profile, /if \(isNewAccount \|\| !touchedFields\.current\.defaultTimeframe\)/);
  assert.match(profile, /if \(isNewAccount \|\| !touchedFields\.current\.timeZone\)/);
  for (const field of ['displayName', 'defaultExchange', 'defaultMarketType', 'defaultTimeframe', 'timeZone']) {
    assert.match(profile, new RegExp("markTouched\\('" + field + "'\\)"));
  }
  assert.doesNotMatch(profile, /saveStoredPreferences\(/,
    'profile form must not overwrite the POSTGRES-confirmed account defaults');
});
