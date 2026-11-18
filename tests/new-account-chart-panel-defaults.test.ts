import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  readSmartAnalysisPanelCollapsed,
  saveSmartAnalysisPanelCollapsed,
} from '../src/utils/smartAnalysisPanelPreference';
import {
  readTelegramAlertPanelCollapsed,
  saveTelegramAlertPanelCollapsed,
} from '../src/utils/telegramAlertPanelPreference';

const source = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('new accounts get both chart panels collapsed in their PostgreSQL profile, without modifying older profiles', () => {
  const registration = source('server/pgIdentity.ts');
  const from = registration.indexOf('export async function registerAccount(');
  const to = registration.indexOf('// Public mail-request endpoints', from);
  assert.ok(from >= 0 && to > from);
  const defaults = registration.slice(from, to);
  assert.match(defaults, /telegramPriceAlertCollapsed:\s*true/);
  assert.match(defaults, /smartAnalysisCollapsed:\s*true/);
  assert.match(defaults, /JSON\.stringify\(\{/);
  assert.match(registration, /'telegramPriceAlertCollapsed', 'smartAnalysisCollapsed'/,
    'Both preferences remain permitted in profile updates');
  const chart = source('src/components/FormationDetailsModal.tsx');
  assert.match(chart, /typeof profilePreference === 'boolean'/);
  assert.match(chart, /typeof saved === 'boolean'/);
  assert.match(chart, /updateProfileData\(\{ telegramPriceAlertCollapsed: collapsed \}\)/);
  assert.match(chart, /updateProfileData\(\{ smartAnalysisCollapsed: next \}\)/);
});

test('chart paints the account profile choices on the first render, not an expanded analysis flash', () => {
  const chart = source('src/components/FormationDetailsModal.tsx');
  assert.match(chart, /useState<boolean>\(\(\) => \{[\s\S]*?profile\?\.telegramPriceAlertCollapsed[\s\S]*?readTelegramAlertPanelCollapsed/);
  assert.match(chart, /useState<boolean>\(\(\) => \{[\s\S]*?profile\?\.smartAnalysisCollapsed[\s\S]*?readSmartAnalysisPanelCollapsed/);
  assert.match(chart, /\{smartAnalysisCollapsed \? \(/);
  assert.match(chart, /!telegramAlertPanelCollapsed &&/);
  assert.doesNotMatch(chart, /new WebSocket\(/);
});

test('existing users can keep explicit expanded choices in local storage', () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
  saveTelegramAlertPanelCollapsed(storage, false, 'existing');
  saveSmartAnalysisPanelCollapsed(storage, false, 'existing');
  assert.equal(readTelegramAlertPanelCollapsed(storage, 'existing'), false);
  assert.equal(readSmartAnalysisPanelCollapsed(storage, 'existing'), false);
  saveTelegramAlertPanelCollapsed(storage, true, 'new');
  saveSmartAnalysisPanelCollapsed(storage, true, 'new');
  assert.equal(readTelegramAlertPanelCollapsed(storage, 'existing'), false);
  assert.equal(readSmartAnalysisPanelCollapsed(storage, 'existing'), false);
  assert.equal(readTelegramAlertPanelCollapsed(storage, 'new'), true);
  assert.equal(readSmartAnalysisPanelCollapsed(storage, 'new'), true);
});
