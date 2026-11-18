import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_METASCALP_SETTINGS, getUserMetaScalpSettings } from '../src/utils/metaScalpService';
import {
  DEFAULT_TERMINAL_LINK_SETTINGS,
  getUserTerminalLinkSettings,
  sendToSelectedTerminal,
} from '../src/utils/terminalLinkService';

test('new PostgreSQL registrations persist disabled linking instead of inheriting the old enabled fallback', () => {
  const registration = readFileSync(new URL('../server/pgIdentity.ts', import.meta.url), 'utf8');
  const start = registration.indexOf('export async function registerAccount(');
  const end = registration.indexOf('// Public mail-request endpoints', start);
  assert.ok(start >= 0 && end > start, 'Inspect the actual registration account bootstrap');
  const signup = registration.slice(start, end);
  assert.match(signup, /terminalLinkSettings:\s*\{\s*provider:\s*'none',\s*enabled:\s*false/);
  assert.match(signup, /switchOnChartOpen:\s*false,\s*autoSignals:\s*false/);
  assert.match(signup, /metaScalpSettings:\s*\{\s*enabled:\s*false,\s*autoSwitchOnClick:\s*false\s*\}/);

  // Model the explicit fields stored by registration and loaded into Profile.
  const profile = {
    uid: 'new-account',
    terminalLinkSettings: {
      ...DEFAULT_TERMINAL_LINK_SETTINGS,
      provider: 'none' as const, enabled: false, switchOnChartOpen: false, autoSignals: false,
    },
    metaScalpSettings: {
      ...DEFAULT_METASCALP_SETTINGS, enabled: false, autoSwitchOnClick: false,
    },
  };
  const linking = getUserTerminalLinkSettings('new-account', profile);
  const meta = getUserMetaScalpSettings('new-account', profile);
  assert.equal(linking.provider, 'none');
  assert.equal(linking.enabled, false);
  assert.equal(linking.switchOnChartOpen, false);
  assert.equal(linking.autoSignals, false);
  assert.equal(meta.enabled, false);
  assert.equal(meta.autoSwitchOnClick, false);
});

test('fresh registration cannot send terminal commands until the user explicitly enables linking', async t => {
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL) => {
    requests.push(String(url));
    return new Response('{}');
  });
  const saved = getUserTerminalLinkSettings('new-account', {
    uid: 'new-account',
    terminalLinkSettings: { ...DEFAULT_TERMINAL_LINK_SETTINGS, provider: 'none', enabled: false },
  });
  const result = await sendToSelectedTerminal(
    'BTCUSDT', 'binance', 'futures', 'screener',
    saved, { ...DEFAULT_METASCALP_SETTINGS, enabled: false },
  );
  assert.equal(result.success, false);
  assert.match(result.message, /Лінковка вимкнена/);
  assert.deepEqual(requests, [], 'No local terminal API requests for new accounts');
});

test('legacy user linking preferences remain unchanged', () => {
  const existing = getUserTerminalLinkSettings('old-account', {
    uid: 'old-account',
    metaScalpSettings: { ...DEFAULT_METASCALP_SETTINGS, enabled: true },
  });
  assert.equal(existing.provider, 'metascalp');
  assert.equal(existing.enabled, true, 'Existing legacy opt-ins are not migrated or reset');
  const optedOut = getUserTerminalLinkSettings('old-account', {
    uid: 'old-account',
    terminalLinkSettings: { ...DEFAULT_TERMINAL_LINK_SETTINGS, enabled: false },
  });
  assert.equal(optedOut.enabled, false, 'Existing saved opt-out must be preserved');
});
