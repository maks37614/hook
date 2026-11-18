import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { locales, translateKey } from '../src/locales';
import { screenerNotificationRows } from '../src/locales/screenerNotifications20261115';
const languages = ['uk', 'en', 'ru', 'pl'] as const;
test('Screener sorting and notification center labels have four complete translations', () => {
  const seen = new Set<string>();
  for (const row of screenerNotificationRows) {
    assert.equal(row.length, 5);
    assert.ok(!seen.has(row[0]), row[0]);
    seen.add(row[0]);
    for (const [index, language] of languages.entries()) {
      const key = 'i18n.' + row[0];
      assert.ok(row[index + 1].trim());
      assert.equal(locales[language].strings[key], row[index + 1]);
      assert.equal(translateKey(language, key), row[index + 1]);
    }
  }
});
test('Screener keyboard typeahead and notification center use localized labels', () => {
  const source = (file: string) => readFileSync(new URL('../src/components/' + file, import.meta.url), 'utf8');
  const sort = source('ScreenerSortDropdown.tsx');
  const bell = source('SiteNotificationBell.tsx');
  assert.ok(sort.includes('optionText(option).toLocaleLowerCase().startsWith(text)'));
  assert.ok(sort.includes('{optionText(OPTIONS[selectedIndex])}'));
  assert.ok(bell.includes('i18n.siteCenter.empty'));
  assert.ok(bell.includes('i18n.siteCenter.linkUnavailable'));
  assert.equal(translateKey('pl','i18n.screenerSort.priceChange'),'Zmiana 24 h (%)');
  assert.equal(translateKey('en','i18n.siteCenter.read'),'Mark all read');
});
