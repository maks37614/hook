import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fullscreenChartRows } from '../src/locales/fullscreenChart20261115';
import { interpolate, translatePhrase, supportedLanguages } from '../src/locales';

const source = readFileSync(new URL('../src/components/FullscreenChartModal.tsx', import.meta.url), 'utf8');

test('fullscreen chart labels have four translations with matching interpolation keys', () => {
  assert.ok(fullscreenChartRows.length >= 35);
  const seen = new Set<string>();
  const tokens = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort();
  for (const row of fullscreenChartRows) {
    assert.ok(!seen.has(row[0]), 'duplicate chart phrase: ' + row[0]);
    seen.add(row[0]);
    for (const [index, lang] of supportedLanguages.entries()) {
      assert.ok(row[index]?.trim(), lang + ': blank ' + row[0]);
      assert.deepEqual(tokens(row[index]), tokens(row[0]), lang + ': interpolation keys mismatch');
      const active = translatePhrase(lang, row[0]);
      // The merged catalog can contain a newer reviewed wording than the
      // fullscreen module, but must preserve every interpolation parameter.
      assert.ok(active.trim(), lang + ': missing active translation ' + row[0]);
      assert.deepEqual(tokens(active), tokens(row[0]),
        lang + ': active interpolation keys mismatch ' + row[0]);
    }
  }
});

test('forecast levels preserve prices, group numbers and confirmation counts', () => {
  const english = interpolate(
    translatePhrase('en', 'Очікування дотиків {{count}}/{{required}}'),
    { count: 2, required: 3 },
  );
  assert.equal(english, 'Waiting for touches 2/3');
  assert.equal(interpolate(translatePhrase('pl', 'Надіслати в обраний термінал (Група {{group}})'), { group: '001' }),
    'Wyślij do wybranego terminala (Grupa 001)');
  assert.equal(interpolate(translatePhrase('en', 'Можлива формація: {{name}}. Прогноз приховано — відкрито іншу монету або ринок.'), { name: 'Possible double bottom (W)' }),
    'Possible formation: Possible double bottom (W). Projection hidden because a different coin or market is open.');
});

test('chart uses selected language when rendering actions and levels, without changing level visibility', () => {
  assert.match(source, /useLanguage\(\)/);
  assert.match(source, /tp\('Очікування дотиків \{\{count\}\}\/\{\{required\}\}'/);
  assert.match(source, /title=\{tr\(isFavoritesDrawerOpen/);
  assert.match(source, /tr\(level\.name\)/);
  assert.match(source, /tr\(displayedEarlyCandidate\.name\)/);
  assert.match(source, /toggleEarlyLevel\(level\.key\)/);
  assert.match(source, /earlyLevelVisibility\[level\.key\]/);
  assert.match(source, /handleRemoveFromWatchlist\(favCoin, e\)/);
});

test('all literal fullscreen labels and favorite drawer actions have four translations', () => {
  const phrases = new Set([
    ...[...source.matchAll(/\btr\("([^"\n]+)"\)/g)].map(match => match[1]),
    ...[...source.matchAll(/\btr\('([^'\n]+)'\)/g)].map(match => match[1]),
    'Futures', 'Spot',
  ]);
  const catalog = new Set<string>(fullscreenChartRows.map(row => row[0]));
  for (const phrase of phrases) {
    assert.ok(catalog.has(phrase), 'missing four-language fullscreen catalog key: ' + phrase);
    for (const language of supportedLanguages) {
      const rendered = translatePhrase(language, phrase);
      assert.ok(rendered.trim(), language + ': blank label ' + phrase);
      if (language === 'en' || language === 'pl') {
        assert.doesNotMatch(rendered, /[А-Яа-яІіЇїЄєҐґ]/, language + ': untranslated chart label: ' + phrase);
      }
    }
  }
  for (const language of supportedLanguages) {
    const definition = source.split('\n').find(line => line.startsWith('  ' + language + ': { choose:'));
    assert.ok(definition, language + ': missing favorite drawer locale');
    for (const property of ['drag:', 'copy:', 'copyFailed:', 'linking:', 'futuresShort:', 'spotShort:']) {
      assert.ok(definition?.includes(property), language + ': missing favorite drawer key ' + property);
    }
  }
  const terms = ['Немає актуальних даних за 24 години', 'Створити сповіщення в Telegram',
    'Крок ціни не перевірено', 'Видалити з обраного', 'Не вдалося завантажити свічки з біржі'];
  for (const phrase of terms) assert.ok(catalog.has(phrase), 'missing fullscreen UI: ' + phrase);
});

test('touch favorite drag cannot accidentally open a market by delayed click', () => {
  assert.match(source, /suppressedFavoriteClickRef\.current = \{ key: getCoinWatchlistKey\(gesture\.coin\), until: Date\.now\(\) \+ 450 \}/);
  assert.match(source, /suppressedFavoriteClickRef\.current\?\.key === favoriteKey/);
  assert.match(source, /if \(targetId\) acceptFavoriteDrop\(targetId\)/);
  assert.match(source, /onPointerCancel=\{event => stopTouchFavorite\(event, true\)\}/);
  assert.match(source, /onDragEnd=\{clearFavoriteDrag\}/);
  assert.doesNotMatch(source, /suppressFavoriteClickRef/);
});
