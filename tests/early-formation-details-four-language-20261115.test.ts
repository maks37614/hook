import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translatePhrase } from '../src/locales';

const source = readFileSync(
  new URL('../src/components/EarlyFormationDetailsModal.tsx', import.meta.url),
  'utf8',
);

const labels = [
  'Котирування підключено',
  'Очікування котирування',
  'Поточна ціна та зміна за 24 години',
  'Власне цінове сповіщення Telegram (не сигнал ранньої формації)',
  'Налаштувати власне сповіщення ціни',
  'Лінковка ·',
  'Відкрити MetaScalp',
  'Повернутися до формацій',
  'Назад',
  'Завантаження свічок з біржі…',
  'Графік на весь екран',
] as const;

test('Early W/M chart controls, loading state and screen-reader labels follow active language', () => {
  assert.match(source, /const \{ language \} = useLanguage\(\)/);
  assert.match(source, /const tr = \(text: string\) => translatePhrase\(language, text\)/);
  assert.match(source, /aria-label=\{tr\(liveConnected \? 'Котирування підключено' : 'Очікування котирування'\)\}/);
  assert.match(source, /aria-label=\{tr\("Поточна ціна та зміна за 24 години"\)\}/);
  assert.match(source, /title=\{tr\("Повернутися до формацій"\)\}/);
  assert.match(source, /title=\{tr\("Лінковка ·"\) \+ ' ' \+ metaScalpBinding\}/);
  assert.match(source, /\{tr\("Завантаження свічок з біржі…"\)\}/);
  assert.match(source, /\{tr\("Графік на весь екран"\)\}/);
  const display = source.slice(source.indexOf('  return ('));
  const withoutTranslatedLiterals = display.replace(/\btr\((["'])(.*?)\1\)/g,'TRANSLATED')
    .replace(/\btr\(liveConnected \? 'Котирування підключено' : 'Очікування котирування'\)/g,'TRANSLATED');
  assert.doesNotMatch(withoutTranslatedLiterals, /\b(?:aria-label|title|placeholder)="[^"]*[А-Яа-яІіЇїЄєҐґ]/);
  assert.doesNotMatch(withoutTranslatedLiterals, />[^<>{}\n]*[А-Яа-яІіЇїЄєҐґ][^<>{}\n]*</);
});

test('all newly connected early-formation labels already have EN/PL/RU variants', () => {
  for (const sourceText of labels) {
    assert.ok(translatePhrase('uk', sourceText).trim());
    for (const language of ['en','pl','ru'] as const) {
      const value = translatePhrase(language, sourceText);
      assert.ok(value.trim(), language + ' has an empty label: ' + sourceText);
      // Ukrainian and Russian correctly share the spelling «Назад».
      if (!(language === 'ru' && sourceText === 'Назад')) {
        assert.notEqual(value, sourceText, language + ' falls back to Ukrainian for: ' + sourceText);
      }
    }
  }
});

test('early chart remains a preview: live prices and candidate marker data unchanged', () => {
  assert.match(source, /fetchDirectKlines\(coin\.exchange, coin\.marketType, coin\.symbol, timeframe, 1000\)/);
  assert.match(source, /earlyFormationChartMarkers\(candidate\)/);
  assert.match(source, /onLiveStatusChange=\{\(status\) => setLiveConnected\(status\.isConnected\)\}/);
  assert.match(source, /onOpenTelegramModal\(\{[\s\S]*?symbol: coin\.symbol/);
  assert.match(source, /onSendMetaScalp\(coin\)/);
  assert.match(source, /forceHookChart/);
});
