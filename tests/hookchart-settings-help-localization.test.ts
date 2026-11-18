import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAIN_SETTINGS_HELP } from '../src/components/hookchart/mainSettingsHelp';
import { translateHookChartPhrase } from '../src/locales/hookchartLanguage';

test('all HookChart setting help explanations are localized in four languages', () => {
  let checked = 0;
  for (const [section, controls] of Object.entries(MAIN_SETTINGS_HELP)) {
    for (const [name, source] of Object.entries(controls)) {
      if (!/[А-Яа-яІіЇїЄєҐґ]/.test(source)) continue;
      const context = section + ' / ' + name;
      assert.ok(source.trim().length > 0, context);
      assert.equal(translateHookChartPhrase('uk', source), source, context + ' Ukrainian');
      for (const language of ['en', 'pl', 'ru'] as const) {
        const translated = translateHookChartPhrase(language, source);
        assert.ok(translated.trim().length > 0, language + ' / ' + context);
        assert.notEqual(translated, source, language + ' untranslated / ' + context);
        if (language !== 'ru') {
          assert.doesNotMatch(translated, /[А-Яа-яІіЇїЄєҐґ]/, language + ' contains untranslated Cyrillic / ' + context);
        }
      }
      checked++;
    }
  }
  assert.ok(checked >= 75, 'help catalog coverage unexpectedly decreased');
});

test('market-print tooltip uses the requested Russian wording without changing its control', () => {
  const source = MAIN_SETTINGS_HELP['Інтерфейс']['Показувати суми великих ринкових заявок під свічками'];
  assert.equal(source, 'Показує під свічками сумарний обсяг великих ринкових угод');
  assert.equal(translateHookChartPhrase('ru', source),
    'Показывает под свечами суммарный объём крупных рыночных сделок');
  assert.equal(translateHookChartPhrase('en', source),
    'Shows the total volume of large market trades below the candles');
  assert.equal(translateHookChartPhrase('pl', source),
    'Pokazuje pod świecami łączny wolumen dużych transakcji rynkowych');
  const settings = readFileSync(new URL('../src/components/hookchart/OriginalHookChartSettings.tsx', import.meta.url), 'utf8');
  assert.match(settings, /<SwitchRow label="Показувати суми великих ринкових заявок під свічками" value=\{prefs\.showMarketPrintSums === true\}/);
});

test('large market trades and forced liquidations have explanatory descriptions in four languages', () => {
  const explanations = [
    {
      source: 'Фактично виконані великі покупки та продажі',
      en: 'Large buy and sell market trades that have actually executed',
      ru: 'Фактически исполненные крупные покупки и продажи',
      pl: 'Faktycznie zrealizowane duże transakcje kupna i sprzedaży',
    },
    {
      source: 'Примусове закриття позицій через недостатню маржу',
      en: 'Forced closure of positions due to insufficient margin',
      ru: 'Принудительное закрытие позиций из-за недостаточной маржи',
      pl: 'Przymusowe zamknięcie pozycji z powodu niewystarczającego depozytu zabezpieczającego',
    },
  ] as const;
  for (const explanation of explanations) {
    assert.equal(translateHookChartPhrase('uk', explanation.source), explanation.source);
    for (const language of ['en', 'ru', 'pl'] as const) {
      assert.equal(translateHookChartPhrase(language, explanation.source), explanation[language]);
    }
  }
  const settings = readFileSync(new URL('../src/components/hookchart/OriginalHookChartSettings.tsx', import.meta.url), 'utf8');
  assert.match(settings, /label="Показувати суми великих ринкових заявок під свічками"[^\n]*desc="Фактично виконані великі покупки та продажі"/);
  assert.match(settings, /label="Ліквідації на графіку"[^\n]*desc="Примусове закриття позицій через недостатню маржу"/);
  assert.match(settings, /const language = useContext\(ChartSettingsLanguageContext\)/);
  assert.match(settings, /<Setting label=\{label\} desc=\{desc\} help=\{help\}/);
  assert.match(settings, /translateHookChartPhrase\(language, desc\)/);
});
