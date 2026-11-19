import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translateHookChartPhrase } from '../src/locales/hookchartLanguage';
import type { SupportedLanguage } from '../src/locales';

const phrases = [
  'Керування масштабом графіка', 'Збільшити масштаб', 'Зменшити масштаб',
  'Скинути масштаб', 'Вся історія: увімкнено',
  'Вся завантажена історія поточного таймфрейму', 'Показати всю історію',
  'Згорнути масштабування', 'Розгорнути масштабування',
  'Бичачий', 'Ведмежий', 'Нейтральний', 'Ризик',
];
test('HookChart zoom controls and strategy risk/direction translate in UA/EN/PL/RU', () => {
  const languages: SupportedLanguage[] = ['uk', 'en', 'pl', 'ru'];
  for (const phrase of phrases) {
    for (const language of languages) {
      const translated = translateHookChartPhrase(language, phrase);
      assert.ok(translated.length, language + ' missing ' + phrase);
      if (language !== 'uk') assert.notEqual(translated, phrase, language + ' untranslated ' + phrase);
    }
  }
  assert.equal(translateHookChartPhrase('en', 'Скинути масштаб'), 'Reset');
  assert.equal(translateHookChartPhrase('pl', 'Ведмежий'), 'Spadkowy');
  assert.equal(translateHookChartPhrase('ru', 'Ризик'), 'Риск');
});

test('renderer uses translations for both visual copy and interactive tooltips', () => {
  const source = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  assert.match(source, /translateHookChartPhrase\(language,"Скинути масштаб"\)/);
  assert.match(source, /translateHookChartPhrase\(language,"Збільшити масштаб"\)/);
  assert.match(source, /translateHookChartPhrase\(language,"Зменшити масштаб"\)/);
  assert.match(source, /translateHookChartPhrase\(language,'Ризик'\)/);
  assert.match(source, /translateHookChartPhrase\(language,strategyResult\.directionScore>0/);
  assert.doesNotMatch(source, />Reset<\/button>/);
});
