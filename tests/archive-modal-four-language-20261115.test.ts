import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interpolate, locales, translateKey } from '../src/locales';
import { archiveModalRows } from '../src/locales/archiveModal20261115';

const languages = ['uk', 'en', 'ru', 'pl'] as const;
const params = (text: string) => [...text.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1]).sort();

test('Archive modal labels are complete, unique, and keep placeholders in all four languages', () => {
  const seen = new Set<string>();
  for (const row of archiveModalRows) {
    assert.equal(row.length, 5);
    assert.ok(!seen.has(row[0]), 'duplicate archive phrase: ' + row[0]);
    seen.add(row[0]);
    const parameters = Object.fromEntries(params(row[1]).map(name => [name, '12']));
    for (const [index, language] of languages.entries()) {
      const key = 'archive.' + row[0];
      assert.ok(row[index+1].trim());
      assert.deepEqual(params(row[index+1]), params(row[1]));
      assert.equal(locales[language].strings[key], row[index+1]);
      assert.equal(translateKey(language, key, parameters), interpolate(row[index+1], parameters));
    }
  }
});

test('Archive modal localizes private status, confirmations, confluence help and dates', () => {
  const source = readFileSync(new URL('../src/components/ArchiveModal.tsx', import.meta.url), 'utf8');
  for (const key of ['archive.title','archive.clearConfirm','archive.searchPlaceholder','archive.confluenceLabel', 'archive.confluenceHelp', 'archive.confluenceHelpTitle', 'archive.markers']) {
    assert.ok(source.includes(key), 'missing localized control ' + key);
  }
  assert.ok(source.includes("d.toLocaleString(({ uk: 'uk-UA', en: 'en-GB', pl: 'pl-PL', ru: 'ru-RU' } as const)[language]"));
  assert.doesNotMatch(source, /handleCopyQualityProof|archive\.communityScore/, 'retired Community score export stays absent');
  assert.doesNotMatch(source, /handleSendToCommunity\(/, 'Community action is intentionally removed from archive cards');
  assert.match(source, /aria-label=\{t\('archive\.confluenceHelpTitle'\)\}/);
  assert.match(source, /event\.stopPropagation\(\)/);
  assert.equal(translateKey('en','archive.markers',{count:5}), 'Saved markers: 5');
});

test('Saved formation cards hide the long formation title and show a short Chart action in all languages', () => {
  const source = readFileSync(new URL('../src/components/ArchiveModal.tsx', import.meta.url), 'utf8');
  const cardStart = source.indexOf('filteredFormations.map((item) => {');
  const cardEnd = source.indexOf('{item.entryReason?.trim() && (', cardStart);
  assert.ok(cardStart >= 0 && cardEnd > cardStart, 'saved archive card is present');
  const card = source.slice(cardStart, cardEnd);

  assert.doesNotMatch(card, /\{tr\(item\.formationName\)\}/,
    'long saved formation names should not be displayed in archive cards');
  assert.match(source, /item\.formationName\.toLowerCase\(\)\.includes\(query\)/,
    'saved formation names must remain searchable');
  assert.match(card, /t\('archive\.openChart'\)/, 'chart action stays wired to archive detail');
  assert.match(card, /handleOpenArchived\(item\)/);
  assert.match(card, /item\.confidence/);
  assert.match(card, /archive\.bullish/);
  assert.match(card, /archive\.bearish/);

  for (const [language, expected] of Object.entries({
    uk: 'Графік',
    en: 'Chart',
    ru: 'График',
    pl: 'Wykres',
  }) as [typeof languages[number], string][]) {
    assert.equal(translateKey(language, 'archive.openChart'), expected);
  }
});

test('Archive card displays nonempty personal reasons above Entry and Target, and hides empty reasons', () => {
  const source = readFileSync(new URL('../src/components/ArchiveModal.tsx', import.meta.url), 'utf8');
  const cardStart = source.indexOf('filteredFormations.map((item) => {');
  const conditionalAt = source.indexOf('{item.entryReason?.trim() && (', cardStart);
  const reasonAt = source.indexOf('data-archive-entry-reason', cardStart);
  const entryGridAt = source.indexOf('{/* Saved Entry Points Grid */}', cardStart);
  const entryPriceAt = source.indexOf("t('archive.entry')", entryGridAt);
  const targetPriceAt = source.indexOf("t('archive.target')", entryGridAt);

  assert.ok(cardStart >= 0 && conditionalAt > cardStart && reasonAt > conditionalAt && entryGridAt > reasonAt,
    'optional personal reason belongs inside each saved card directly above the price grid');
  assert.ok(entryPriceAt > entryGridAt && targetPriceAt > entryPriceAt,
    'Entry and Target remain under the personal reason');
  const reasonBlock = source.slice(conditionalAt, entryGridAt);
  assert.match(reasonBlock, /item\.entryReason\?\.trim\(\)/);
  assert.match(reasonBlock, /\{item\.entryReason\}/, 'show the exact text supplied for this record');
  assert.match(reasonBlock, /data-no-translate/, 'never auto-translate the user-authored reason');
  assert.match(reasonBlock, /whitespace-pre-wrap break-words/, 'preserve line breaks and fit on mobile');
  assert.match(reasonBlock, /t\('archive\.entryReason'\)/);
  assert.doesNotMatch(reasonBlock, /t\('archive\.entryReasonMissing'\)/,
    'empty reasons hide the entire section, not an empty-state message');
  assert.doesNotMatch(reasonBlock, /item\.formationName|item\.notes/, 'do not substitute an automatic pattern title');
  for (const [language, title, missing] of [
    ['uk','Причина входу','Причину входу не вказано для цього запису.'],
    ['en','Entry reason','No entry reason was provided for this record.'],
    ['ru','Причина входа','Причина входа для этой записи не указана.'],
    ['pl','Powód wejścia','Dla tego wpisu nie podano powodu wejścia.'],
  ] as const) {
    assert.equal(translateKey(language, 'archive.entryReason'), title);
    assert.equal(translateKey(language, 'archive.entryReasonMissing'), missing);
  }
});
