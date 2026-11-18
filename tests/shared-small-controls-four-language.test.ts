import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../src/context/LanguageContext';
import { translateKey, translatePhrase } from '../src/locales';
import { sharedControlRows } from '../src/locales/sharedControls20261115';
import { LegalPage } from '../src/components/LegalPage';
import { AlertToast } from '../src/components/AlertToast';
import { MetaScalpToast } from '../src/components/MetaScalpToast';
import { CopyableCoinSymbol } from '../src/components/CopyableCoinSymbol';

const read = (name: string) => readFileSync(new URL('../src/components/' + name, import.meta.url), 'utf8');
const wrap = (element: React.ReactElement) =>
  renderToStaticMarkup(React.createElement(LanguageProvider, { children: element }));

test('shared legal and MetaScalp group labels have all four language variants', () => {
  assert.equal(sharedControlRows.length, 2);
  for (const row of sharedControlRows) {
    for (const [index, language] of (['uk','en','ru','pl'] as const).entries()) {
      assert.equal(translatePhrase(language, row[0]), row[index]);
    }
  }
  assert.equal(translatePhrase('en', 'Language / Мова'), 'Language');
  assert.equal(translatePhrase('pl', 'Language / Мова'), 'Język');
  assert.equal(translatePhrase('en', 'На весь екран (Fullscreen)'), 'Expand to full screen (Fullscreen)');
  assert.equal(translatePhrase('pl', 'Сповіщення встановлено'), 'Powiadomienie ustawiono');
});

test('public legal navigation labels are localized without changing document content or routes', () => {
  const source = read('LegalPage.tsx');
  assert.match(source, /aria-label=\{tr\("На весь екран"\)\}/);
  assert.match(source, /title=\{tr\("На весь екран \(Fullscreen\)"\)\}/);
  assert.match(source, /htmlFor="legal-language">\{tr\("Language \/ Мова"\)\}/);
  assert.match(source, /aria-label=\{tr\("Language \/ Мова"\)\}/);
  const html = wrap(React.createElement(LegalPage, { page: 'terms' }));
  assert.match(html, /aria-label="На весь екран"/);
  assert.match(html, /id="legal-language"/);
  assert.match(html, /href="\/terms"/);
  assert.match(html, /href="\/privacy"/);
});

test('alert and MetaScalp toast messages use current language but preserve external payloads', () => {
  const alert = read('AlertToast.tsx');
  const terminal = read('MetaScalpToast.tsx');
  assert.match(alert, /\{tr\('Сповіщення встановлено'\)\}/);
  assert.match(alert, /toast\.message \|\| tr\('Telegram надішле сповіщення при досягненні ціни'\)/);
  assert.match(terminal, /\{tr\('Група'\)\} \{toast\.binding\}/);
  assert.match(terminal, /\{toast\.title\}/);
  assert.match(terminal, /\{toast\.ticker\}/);
  assert.match(terminal, /\{toast\.message\}/);
  for (const component of [alert, terminal]) {
    assert.match(component, /aria-label=\{tr\('Закрити'\)\}/);
  }
  const html = wrap(React.createElement(AlertToast, {
    toast: { id: 1, symbol: 'BTCUSDT', targetPrice: 123.45, condition: 'gte' },
    onDismiss: () => {},
  }));
  assert.match(html, /Сповіщення встановлено/);
  assert.match(html, /BTCUSDT/);
  const terminalHtml = wrap(React.createElement(MetaScalpToast, {
    toast: { id: 1, type: 'success', title: 'MetaScalp', ticker: 'ETHUSDT', binding: '005', message: 'Payload test' },
    onDismiss: () => {},
  }));
  assert.match(terminalHtml, /Група 005/);
  assert.match(terminalHtml, /Payload test/);
});

test('chart coin symbol copy uses existing translated clipboard controls and retains pair', () => {
  const source = read('CopyableCoinSymbol.tsx');
  assert.match(source, /const \{ t \} = useLanguage\(\)/);
  for (const key of ['ui.copy.symbol','ui.copy.symbolTitle','ui.copy.copied','ui.copy.copiedAria','ui.copy.failed']) {
    assert.ok(source.includes('t(\'' + key + '\''), 'missing ' + key);
    for (const language of ['uk','en','ru','pl'] as const) {
      const translated = translateKey(language, key, { symbol: 'BTC/USDT' });
      assert.ok(translated.includes('BTC/USDT') || key === 'ui.copy.failed');
      assert.ok(translated.trim() && translated !== key);
    }
  }
  assert.match(source, /copyTextToClipboard\(pair\)/);
  assert.match(source, /const pair = `\$\{baseAsset\}\/\$\{quoteAsset\}`/);
  const html = wrap(React.createElement(CopyableCoinSymbol, { baseAsset: 'BTC', quoteAsset: 'USDT' }));
  assert.match(html, /BTC\/USDT/);
  assert.match(html, /aria-label="Скопіювати BTC\/USDT"/);
});
