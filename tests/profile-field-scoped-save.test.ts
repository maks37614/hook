import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  buildProfileAccountPatch, emptyProfileAccountDirtyFields,
  type ProfileAccountDraft,
} from '../src/utils/profileAccountPatch';

const sample: ProfileAccountDraft = {
  displayName: 'Trader',
  defaultExchange: 'binance',
  defaultMarketType: 'futures',
  defaultTimeframe: '5m',
  timeZone: 'auto',
};

test('profile PATCH sends nothing if the account dialog has no edits', () => {
  const dirty = emptyProfileAccountDirtyFields();
  const initial = { ...sample };
  assert.deepEqual(buildProfileAccountPatch(sample, dirty, 'Anonymous'), {});
  assert.deepEqual(sample, initial, 'the helper must not mutate draft state');
  assert.deepEqual(dirty, emptyProfileAccountDirtyFields());
});

test('timeframe edit cannot revert remotely updated exchange, market, zone or display name', () => {
  const dirty = emptyProfileAccountDirtyFields();
  dirty.defaultTimeframe = true;
  const staleModal = { ...sample, defaultTimeframe: '15m' as const };
  const patch = buildProfileAccountPatch(staleModal, dirty, 'Anonymous');
  assert.deepEqual(patch, { defaultTimeframe: '15m' });
  const serverAfterOtherDevice = {
    displayName: 'Remote user', defaultExchange: 'bybit',
    defaultMarketType: 'spot', defaultTimeframe: '5m', timeZone: 'Europe/Kyiv',
  };
  assert.deepEqual({ ...serverAfterOtherDevice, ...patch }, {
    ...serverAfterOtherDevice, defaultTimeframe: '15m',
  });
});

test('every field may be saved independently and display name is normalized', () => {
  for (const field of ['defaultExchange', 'defaultMarketType', 'defaultTimeframe', 'timeZone'] as const) {
    const dirty = emptyProfileAccountDirtyFields();
    dirty[field] = true;
    assert.deepEqual(buildProfileAccountPatch(sample, dirty, 'Anonymous'), { [field]: sample[field] });
  }
  const dirty = emptyProfileAccountDirtyFields();
  dirty.displayName = true;
  assert.deepEqual(buildProfileAccountPatch({ ...sample, displayName: '  Alice  ' }, dirty, 'Guest'), {
    displayName: 'Alice',
  });
  assert.deepEqual(buildProfileAccountPatch({ ...sample, displayName: '  ' }, dirty, 'Guest'), {
    displayName: 'Guest',
  });
  const all = Object.fromEntries(Object.keys(dirty).map(key => [key, true])) as typeof dirty;
  assert.deepEqual(buildProfileAccountPatch(sample, all, 'Guest'), sample);
});

test('account form writes only edited fields and prevents edits during an active save', () => {
  const source = readFileSync(new URL('../src/components/UserProfileModal.tsx', import.meta.url), 'utf8');
  assert.match(source, /const patch = buildProfileAccountPatch\(/);
  assert.match(source, /touchedFields\.current, user\.email\?\.split\('@'\)\[0\]/);
  assert.match(source, /if \(Object\.keys\(patch\)\.length === 0\)/);
  assert.match(source, /setSaveNotice\(noChangesMessage\)/);
  assert.ok(source.indexOf('Keep the response next to Save') > source.indexOf('profile-time-zone'));
  assert.match(source, /role="alert"/);
  const auth = readFileSync(new URL('../src/context/AuthContext.tsx', import.meta.url), 'utf8');
  assert.match(auth, /accountFields\.some\(field => clean\[field\] !== undefined && nextProfile\[field\] !== clean\[field\]\)/);
  assert.match(source, /await updateProfileData\(patch\)/);
  assert.doesNotMatch(source, /await updateProfileData\(\{\s*displayName,/);
  const fields = ['profile-display-name', 'profile-default-exchange', 'profile-default-market',
    'profile-default-timeframe', 'profile-time-zone'];
  for (const field of fields) {
    const index = source.indexOf(`id="${field}"`);
    assert.ok(index > 0, `missing account input ${field}`);
    assert.match(source.slice(index, index + 350), /disabled=\{isSaving\}/, field);
  }
});
