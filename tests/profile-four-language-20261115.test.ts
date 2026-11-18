import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { supportedLanguages, translatePhrase, locales } from '../src/locales';
import { profileLanguagePhrases, profileLanguageRows } from '../src/locales/profileLanguage20261115';
import { getTimeZoneChoices } from '../src/utils/tradingSessions';
import { NOTIFICATION_CATEGORIES } from '../src/utils/siteNotifications';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('all reviewed Profile UI phrases resolve in Ukrainian, English, Russian and Polish', () => {
  assert.deepEqual([...supportedLanguages].sort(), ['en', 'pl', 'ru', 'uk']);
  assert.ok(profileLanguageRows.length >= 190, 'Profile catalog must cover all audited tabs and help');
  const sourcePhrases = profileLanguageRows.map(row => row[0]);
  assert.equal(new Set(sourcePhrases).size, sourcePhrases.length, 'Profile phrases cannot be duplicated');
  for (const row of profileLanguageRows) {
    for (const [index, lang] of (['uk', 'en', 'ru', 'pl'] as const).entries()) {
      assert.ok(row[index].trim(), 'Empty ' + lang + ' translation for ' + row[0]);
      assert.equal(profileLanguagePhrases[lang][row[0]], row[index]);
      // The canonical merged catalog can contain a newer reviewed synonym
      // (e.g. Polish 'Ulubione monety' instead of 'Obserwowane monety').
      assert.ok(locales[lang].phrases[row[0]]?.trim(),
        'Profile translation should be active in the merged locale: ' + lang + ' ' + row[0]);
      assert.ok(translatePhrase(lang, row[0]).trim(),
        'Unreachable Profile translation: ' + lang + ' ' + row[0]);
    }
  }
});

test('Profile paragraph translations accept indented multiline JSX text, but leave unknown strings untouched', () => {
  const sourcePhrase = 'Завершуйте невідомі сеанси. Список завантажується тільки під час відкриття.';
  assert.equal(
    translatePhrase('en', '\n   Завершуйте невідомі сеанси.\n Список завантажується тільки під час відкриття. \n'),
    '\n   Terminate unfamiliar sessions. The list is loaded only when opened. \n',
  );
  assert.equal(
    translatePhrase('pl', '\n Порожнє поле вимикає фільтр. Для числових мінімумів 0 також означає «без обмежень»,\n але для відстані до High/Low значення 0% означає точне торкання рівня.\n Використовуються лише вже отримані котирування й кеш формацій — без окремих запитів та сканування.'),
    profileLanguagePhrases.pl['Порожнє поле вимикає фільтр. Для числових мінімумів 0 також означає «без обмежень», але для відстані до High/Low значення 0% означає точне торкання рівня. Використовуються лише вже отримані котирування й кеш формацій — без окремих запитів та сканування.'].replace(/^/, '\n '),
  );
  assert.equal(translatePhrase('en', 'My custom user content'), 'My custom user content');
  assert.ok(translatePhrase('ru', sourcePhrase).startsWith('Завершайте'));
});

test('Profile notification category titles, explanations and data sources are covered in all four languages', () => {
  assert.ok(NOTIFICATION_CATEGORIES.length >= 15);
  const sourceFile = source('../src/components/profile/ProfileNotificationSettings.tsx');
  assert.match(sourceFile, /translatePhrase\(language, item\.label\)/);
  assert.match(sourceFile, /translatePhrase\(language, item\.explanation\)/);
  assert.match(sourceFile, /translatePhrase\(language, item\.source\)/);
  for (const item of NOTIFICATION_CATEGORIES) {
    for (const text of [item.label, item.explanation, item.source]) {
      for (const language of supportedLanguages) {
        assert.ok(translatePhrase(language, text).trim(), language + ': missing category translation ' + text);
        // Technical labels like "Delta / CVD20" are identical across languages.
        const languageNeutral = /^[A-Za-z0-9 /.+–-]+$/.test(text);
        if (language !== 'uk' && !languageNeutral) {
          assert.notEqual(translatePhrase(language, text), text,
            language + ': untranslated notification category: ' + text);
        }
      }
    }
  }
});

test('Profile account, appearance, search, alerts and terminal linking use shared localized UI', () => {
  const modal = source('../src/components/UserProfileModal.tsx');
  assert.match(modal, /useLanguage\(\)/);
  assert.match(modal, /getTimeZoneChoices\(timeZone, language\)/);
  assert.match(modal, /toLocaleDateString\(dateLocale\)/);
  const index = source('../src/locales/index.ts');
  assert.match(index, /\.\.\.profileLanguagePhrases\[language\]/);
  assert.match(index, /normalizedPhraseAliases/);
  const linking = source('../src/components/profile/ProfileTerminalLinkingSettings.tsx');
  assert.match(linking, /Неправильний формат групи для:/);
  assert.ok(/translatePhrase\(language, result\.message\)/.test(linking) ||
    /translatePhrase\(language, message\.text\)/.test(linking),
    'the terminal-linking success/failure message must be translated before display');
  for (const language of supportedLanguages) {
    assert.match(getTimeZoneChoices('Europe/Warsaw', language)[0].label, /Europe\/Warsaw/);
  }
  assert.match(getTimeZoneChoices('Europe/Warsaw', 'en')[0].label, /Warsaw/);
  assert.match(getTimeZoneChoices('Europe/Warsaw', 'pl')[0].label, /Warszawa/);
  assert.match(getTimeZoneChoices('Europe/Warsaw', 'ru')[0].label, /Варшава/);
});
