import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translatePhrase, translateKey } from '../src/locales';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarketSentimentScale } from '../src/components/MarketSentimentScale';

const source = readFileSync(
  new URL('../src/components/MarketSentimentWidget.tsx', import.meta.url),
  'utf8',
);

test('Market Sentiment controls translate refresh and expand/collapse actions', () => {
  assert.match(source, /const \{ language, t \} = useLanguage\(\)/);
  assert.match(source, /const tr = \(source: string\) => translatePhrase\(language, source\)/);
  assert.match(source, /\{tr\('Оновити'\)\}/);
  assert.match(source, /title=\{tr\('Оновити дані'\)\}/);
  assert.match(source, /aria-label=\{tr\('Оновити дані'\)\}/);
  assert.match(source, /title=\{tr\(expanded \? 'Згорнути' : 'Розгорнути'\)\}/);
  assert.match(source, /aria-label=\{tr\(expanded \? 'Згорнути' : 'Розгорнути'\)\}/);
  for (const label of ['Оновити','Оновити дані','Згорнути','Розгорнути']) {
    assert.equal(translatePhrase('uk', label), label);
    for (const lang of ['en','ru','pl'] as const) {
      const value = translatePhrase(lang, label);
      assert.ok(value.trim());
      assert.notEqual(value, label, lang + ' should translate ' + label);
    }
  }
});

test('Market Sentiment localization preserves fetch rate, data and profile settings logic', () => {
  assert.match(source, /fetch\('\/api\/market\/sentiment'\)/);
  assert.match(source, /setInterval\(refreshVisible, 30000\)/);
  assert.match(source, /document\.visibilityState === 'hidden'/);
  assert.match(source, /document\.addEventListener\('visibilitychange', refreshVisible\)/);
  assert.match(source, /updateProfileData\(\{ marketSentimentExpanded: next \}\)/);
  assert.match(source, /const expanded = localExpansion\?\.accountScope === accountScope/);
  assert.match(source, /<MarketSentimentScale score=\{data\.compositeScore\}/);
});

test('complete Market Sentiment meter and indicator labels are translated in all four languages', () => {
  const expected = {
    uk: { fear: 'Страх', neutral: 'Нейтрально', greed: 'Жадібність', title: 'Настрій Ринку' },
    en: { fear: 'Fear', neutral: 'Neutral', greed: 'Greed', title: 'Market Sentiment' },
    pl: { fear: 'Strach', neutral: 'Neutralnie', greed: 'Chciwość', title: 'Nastroje rynkowe' },
    ru: { fear: 'Страх', neutral: 'Нейтрально', greed: 'Жадность', title: 'Настроение рынка' },
  } as const;
  for (const language of ['uk','en','pl','ru'] as const) {
    const labels = expected[language];
    for (const label of ['fear','neutral','greed','title'] as const) {
      assert.equal(translateKey(language, 'sentiment.' + label), labels[label],
        language + ' must not fall back to another locale');
    }
    for (const key of ['sentiment.meterAria','sentiment.meterValue','sentiment.description',
      'sentiment.loading','sentiment.noData','sentiment.fetchError','sentiment.refreshFail',
      'sentiment.staleSources','sentiment.preferenceError','sentiment.historyHelp']) {
      const rendered = translateKey(language, key, { score: 42, label: labels.neutral, fresh: 2, total: 3 });
      assert.ok(rendered && rendered !== key, language + ': missing translation for ' + key);
      if (language === 'en' || language === 'pl') {
        assert.doesNotMatch(rendered, /[А-Яа-яІіЇїЄєҐґ]/,
          language + ': unexpected untranslated Cyrillic in ' + key);
      }
    }
    const markup = renderToStaticMarkup(React.createElement(MarketSentimentScale, {
      score: 42, sentimentLabel: labels.neutral, language,
    }));
    assert.match(markup, /aria-valuenow="42"/);
    assert.match(markup, /left:42%/, 'pointer follows real score, not visual midpoint');
    assert.ok(markup.includes(labels.fear) && markup.includes(labels.neutral) && markup.includes(labels.greed),
      language + ' labels should render together with the centered bar');
    assert.match(markup, /data-market-sentiment-labels/);
  }
});
