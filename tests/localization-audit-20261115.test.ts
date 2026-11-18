import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { supportedLanguages, translatePhrase, locales } from '../src/locales';
import { audit20261115Phrases, audit20261115Rows } from '../src/locales/audit20261115';
import { audit20261115Alerts, audit20261115AlertsRows } from '../src/locales/audit20261115Alerts';
import { audit20261115Settings, audit20261115SettingsRows } from '../src/locales/audit20261115Settings';
import { audit20261115Analysis, audit20261115AnalysisRows } from '../src/locales/audit20261115Analysis';

const catalogs = [
  { value: audit20261115Phrases, rows: audit20261115Rows },
  { value: audit20261115Alerts, rows: audit20261115AlertsRows },
  { value: audit20261115Settings, rows: audit20261115SettingsRows },
  { value: audit20261115Analysis, rows: audit20261115AnalysisRows },
];

test('new audit connects all reviewed UI phrases in four languages', () => {
  assert.equal(supportedLanguages.length, 4);
  const sources = new Set<string>();
  let total = 0;
  for (const catalog of catalogs) {
    const keys = Object.keys(catalog.value.uk);
    assert.deepEqual(keys, Object.keys(catalog.value.en));
    assert.deepEqual(keys, Object.keys(catalog.value.ru));
    assert.deepEqual(keys, Object.keys(catalog.value.pl));
    assert.equal(keys.length, catalog.rows.length, 'No duplicate keys inside a catalog');
    for (const phrase of keys) {
      assert.ok(phrase.trim(), 'No blank source phrase');
      assert.ok(!sources.has(phrase), 'Duplicate source in audit: ' + phrase);
      sources.add(phrase);
      for (const lang of supportedLanguages) {
        const translated = catalog.value[lang][phrase];
        assert.ok(translated?.trim(), lang + ': missing ' + phrase);
        // Later reviewed catalogs can refine identical phrases; validate that
        // the active translation is present and the translator uses it.
        const active = locales[lang].phrases[phrase];
        assert.ok(active?.trim(), lang + ': audited source not translated: ' + phrase);
        assert.equal(translatePhrase(lang, phrase).trim(), active.trim(),
          lang + ': phrase not connected to the active UI translator: ' + phrase);
      }
      total++;
    }
  }
  assert.ok(total > 240, 'The four audit catalogs must cover all reviewed interface text');
});

test('navigation, chart, notifications and profile UI use the four-language catalog', () => {
  const samples = [
    ['Пошук', 'Search', 'Поиск', 'Szukaj'],
    ['LIVE СТРІЧКА 24/7', 'LIVE FEED 24/7', 'ЛЕНТА LIVE 24/7', 'STRUMIEŃ LIVE 24/7'],
    ['РЕЖИМ ВІДТВОРЕННЯ', 'REPLAY MODE', 'РЕЖИМ ВОСПРОИЗВЕДЕНИЯ', 'TRYB ODTWARZANIA'],
    ['Графік на весь екран', 'Fullscreen chart', 'График на весь экран', 'Wykres pełnoekranowy'],
    ['Власна ціна недопустима — рівні АВТО, дотики враховуються',
      'Custom price is invalid — AUTO levels are used; touches are counted',
      'Своя цена недопустима — используются уровни АВТО, касания учитываются',
      'Własna cena jest nieprawidłowa — użyto poziomów AUTO z uwzględnieniem dotknięć'],
    ['Мінімальна волатильність 5m, %', 'Minimum 5m volatility, %',
      'Минимальная волатильность 5m, %', 'Minimalna zmienność 5m, %'],
  ] as const;
  // Each sample lists [Ukrainian source, English, Russian, Polish].
  // The source is the expected Ukrainian rendering, not the first translation.
  for (const [source, ...translations] of samples) {
    assert.equal(translatePhrase('uk', source), source, 'uk: ' + source);
    for (const [index, lang] of (['en', 'ru', 'pl'] as const).entries()) {
      assert.equal(translatePhrase(lang, source), translations[index],
        lang + ': ' + source);
    }
  }
});

test('DOM auto-translator still handles static JSX source text and attributes', () => {
  const languageSource = readFileSync(new URL('../src/context/LanguageContext.tsx', import.meta.url), 'utf8');
  assert.match(languageSource, /translateTextNode\(node as Text, language\)/);
  assert.match(languageSource, /\['title', 'placeholder', 'aria-label', 'aria-description'\]/);
  assert.match(languageSource, /translatePhrase\(language, source\)/);
  const index = readFileSync(new URL('../src/locales/index.ts', import.meta.url), 'utf8');
  for (const catalog of ['audit20261115Phrases','audit20261115Alerts','audit20261115Settings','audit20261115Analysis']) {
    assert.match(index, new RegExp('\\.\\.\\.' + catalog + '\\[language\\]'));
  }
});
