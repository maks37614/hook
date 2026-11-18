import assert from 'node:assert/strict';
import test from 'node:test';
import { translatePhrase } from '../src/locales';
import { audit20261115Rows } from '../src/locales/audit20261115';
import { audit20261115AlertsRows } from '../src/locales/audit20261115Alerts';
import { audit20261115SettingsRows } from '../src/locales/audit20261115Settings';
import { audit20261115AnalysisRows } from '../src/locales/audit20261115Analysis';
import { profileAuthTelegramRows } from '../src/locales/profileAuthTelegram20261115';
import { profileTelegramHistoryRows } from '../src/locales/profileTelegramHistory20261115';

test('profile and Telegram catalogs cannot override reviewed four-language alert vocabulary', () => {
  const audited = new Map<string, readonly string[]>();
  for (const catalog of [
    audit20261115Rows, audit20261115AlertsRows,
    audit20261115SettingsRows, audit20261115AnalysisRows,
  ]) {
    for (const row of catalog) {
      assert.ok(!audited.has(row[0]), 'duplicate audited source: ' + row[0]);
      audited.set(row[0], row);
    }
  }
  let shared = 0;
  for (const catalog of [profileAuthTelegramRows, profileTelegramHistoryRows]) {
    for (const row of catalog) {
      const canonical = audited.get(row[0]);
      if (!canonical) continue;
      shared++;
      assert.deepEqual([...row], [...canonical],
        'Profile overrides reviewed notification wording: ' + row[0]);
      for (const [index, lang] of (['uk', 'en', 'ru', 'pl'] as const).entries()) {
        assert.equal(translatePhrase(lang, row[0]), canonical[index],
          lang + ' active catalog does not match reviewed alert phrase: ' + row[0]);
      }
    }
  }
  assert.ok(shared >= 16, 'expected overlapping profile notification phrases to stay covered');
});
