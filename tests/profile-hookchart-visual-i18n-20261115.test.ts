import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { locales, supportedLanguages, translatePhrase } from '../src/locales';
import { translateHookChartPhrase } from '../src/locales/hookchartLanguage';
import { profileChartVisualPhrases, profileChartVisualRows } from '../src/locales/profileChartVisual20261115';
import { VISUAL_CONTEXTS, SHARED_SCALE_CONTEXTS } from '../src/components/hookchart/visualProfiles';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('HookChart visual-profile descriptions and preview have complete four-language translations', () => {
  assert.deepEqual([...supportedLanguages].sort(), ['en', 'pl', 'ru', 'uk']);
  assert.ok(profileChartVisualRows.length >= 28);
  assert.equal(new Set(profileChartVisualRows.map(row => row[0])).size, profileChartVisualRows.length);
  for (const row of profileChartVisualRows) {
    for (const [index, language] of (['uk', 'en', 'ru', 'pl'] as const).entries()) {
      assert.ok(row[index].trim(), 'Empty translation: ' + language + ': ' + row[0]);
      assert.equal(profileChartVisualPhrases[language][row[0]], row[index]);
      assert.equal(locales[language].phrases[row[0]], row[index], language + ': missing merged phrase ' + row[0]);
      assert.equal(translatePhrase(language, row[0]), row[index], language + ': untranslated phrase ' + row[0]);
    }
  }
  assert.equal(translatePhrase('en', 'Скрінер · Швидкий перегляд'), 'Screener · Quick preview');
  assert.equal(translatePhrase('pl', 'Термінал · Середній графік'), 'Terminal · Średni wykres');
  assert.equal(translatePhrase('ru', 'Штучні свічки · без підключень до бірж'), 'Искусственные свечи · без подключения к биржам');
});

test('new HookChart descriptions resolve through chart translation in each language', () => {
  const autoScale = 'HookChart підлаштовує діапазон цін під видимі свічки. Вимкніть для ручного вертикального зуму. У Терміналі глобальний автомасштаб свічок, якщо увімкнений, має пріоритет над цим перемикачем.';
  const density = 'Автоматично для вибраної монети: 4× типова заявка, ≥25% локальної ліквідності та ≥50% зустрічного потоку за 5 хвилин. Множник змінює базовий поріг; без угод розрахунок використовує стакан.';
  for (const language of supportedLanguages) {
    assert.equal(translateHookChartPhrase(language, autoScale), profileChartVisualPhrases[language][autoScale]);
    assert.equal(translateHookChartPhrase(language, density), profileChartVisualPhrases[language][density]);
  }
});

test('visual chart types retain stable IDs and expose labels to translation', () => {
  assert.equal(VISUAL_CONTEXTS.length, 7);
  assert.equal(SHARED_SCALE_CONTEXTS.length, 2);
  for (const context of [...VISUAL_CONTEXTS, ...SHARED_SCALE_CONTEXTS]) {
    assert.ok(profileChartVisualPhrases.en[context.label], 'Missing visual context: ' + context.label);
    assert.ok(profileChartVisualPhrases.pl[context.label], 'Missing Polish context: ' + context.label);
  }
  const preview = read('../src/components/hookchart/HookChartVisualPreview.tsx');
  for (const source of ['Штучні свічки · без підключень до бірж', 'Маленький штучний графік для попереднього перегляду масштабу та відступів', 'Вільний простір праворуч:', 'видимих барів · умовний ціновий діапазон']) {
    assert.ok(preview.includes(source), 'Chart preview source disappeared: ' + source);
  }
  assert.match(preview, /data-synthetic-hookchart="true"/);
  assert.match(preview, /geometry\.rightGap/);
  assert.match(preview, /createSyntheticPreviewCandles\(560\)/);
});

test('ported HookChart help and dynamic accessibility labels translate without changing rendering behavior', () => {
  const settings = read('../src/components/hookchart/OriginalHookChartSettings.tsx');
  assert.match(settings, /const language = useContext\(ChartSettingsLanguageContext\);/,
    'settings help and switch descriptions use the selected HookChart language');
  assert.ok(/const translatedText = translateHookChartPhrase\(language, text\)/.test(settings) ||
    /const translatedText = text\.endsWith\(unavailableSuffix\)/.test(settings),
    'tooltip content is translated in both current and legacy rendering paths');
  assert.match(settings, /translateHookChartPhrase\(language, 'Пояснення:'\)/);
  assert.match(settings, /translateHookChartPhrase\(language, text\)/);
  assert.match(settings, /aria-label=\{\`\$\{translateHookChartPhrase\(language, 'Пояснення:'\)\}/);
  assert.match(settings, /\{translatedText\}[\s\S]*?document\.body/);
  assert.match(settings, /const localizedLabel = translateHookChartPhrase\(language, label\)/);
  assert.match(settings, /const localizedText = translateHookChartPhrase\(language, text\)/);
  assert.ok(/const tooltip = explanation && unavailable/.test(settings) ||
    /const explanation = mainSettings \? \(mainSettingHelpText\(section, label\)/.test(settings),
    'help text resolves from the active contextual settings catalog');
  assert.match(settings, /<VisualContextPicker value=\{visualContext\} onChange=\{onContextChange\} \/>/);
});
