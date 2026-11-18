import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAIN_SETTINGS_HELP } from '../src/components/hookchart/mainSettingsHelp';
import { STRATEGY_PRESETS } from '../src/components/hookchart/strategyEngine';
import { hookchartSettingsAuditPhrases } from '../src/locales/hookchartSettingsAudit20261115';
import { translateHookChartPhrase } from '../src/locales/hookchartLanguage';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const cyrillic = /[А-Яа-яІіЇїЄєҐґ]/;

test('every newly audited HookChart settings phrase has a real four-language translation', () => {
  const sourceKeys = Object.keys(hookchartSettingsAuditPhrases.uk);
  assert.ok(sourceKeys.length >= 55, 'settings coverage must not silently shrink');
  for (const phrase of sourceKeys) {
    assert.ok(phrase.trim().length > 1);
    assert.equal(translateHookChartPhrase('uk', phrase), phrase);
    for (const language of ['en', 'ru', 'pl'] as const) {
      const value = translateHookChartPhrase(language, phrase);
      assert.ok(value?.trim(), `${language}: missing ${phrase}`);
      // Identical words can be legitimate translations (e.g. «Телефон» in RU).
      if (language !== 'ru' || phrase !== 'Телефон')
        assert.notEqual(value, phrase, `${language}: untranslated ${phrase}`);
      if (language !== 'ru') assert.doesNotMatch(value, cyrillic, `${language}: Cyrillic left in ${phrase}`);
    }
  }
});

test('all HookChart settings control labels, descriptions and accessible text can switch languages', () => {
  const settings = source('../src/components/hookchart/OriginalHookChartSettings.tsx');
  const phrases = new Set<string>();
  // Audit actual JSX strings, not just the translation catalog. Includes
  // labels, tooltips, aria text, status prose and choice names in all five tabs.
  const add = (candidate: string) => {
    const value = candidate.replace(/\s+/g, ' ').trim();
    if (value.length > 1 && cyrillic.test(value) && !/[{}]/.test(value) &&
        !['Українська', 'Русский'].includes(value)) phrases.add(value);
  };
  for (const line of settings.split('\n')) {
    for (const match of line.matchAll(/\b(?:label|desc|help|title|aria-label|placeholder|ariaLabel|heading)="([^"]*)"/g))
      add(match[1]);
    for (const match of line.matchAll(/>\s*([^<>{}\n]*[А-Яа-яІіЇїЄєҐґ][^<>{}\n]*)\s*</g))
      add(match[1]);
    for (const match of line.matchAll(/'([^'\n]*[А-Яа-яІіЇїЄєҐґ][^'\n]*)'/g))
      add(match[1]);
  }
  assert.ok(phrases.size >= 235, 'a UI refactor reduced covered strings unexpectedly');
  for (const phrase of phrases) {
    for (const language of ['en', 'pl'] as const) {
      const translated = translateHookChartPhrase(language, phrase);
      assert.notEqual(translated, phrase, `${language}: untranslated HookChart setting: ${phrase}`);
      assert.doesNotMatch(translated, cyrillic, `${language}: contains Cyrillic: ${phrase}`);
    }
  }
  // Russian has some legitimate unchanged Russian source strings (preset
  // names); explicitly check the primary Ukrainian controls and explanations.
  for (const phrase of ['Показувати суми Liq під свічками', 'Тип графіка',
    'Що показувати в AUTO', 'Розмір тексту міток рівнів', 'Мінімальна сума Long (USD)'])
    assert.notEqual(translateHookChartPhrase('ru', phrase), phrase);
});

test('strategies, their bullets and per-setting help remain localized in four languages', () => {
  const labels = new Set<string>();
  for (const preset of STRATEGY_PRESETS) {
    labels.add(preset.name);
    labels.add(preset.description);
    preset.bullets.forEach(bullet => labels.add(bullet));
  }
  assert.ok(STRATEGY_PRESETS.length >= 15);
  for (const [section, entries] of Object.entries(MAIN_SETTINGS_HELP)) {
    for (const [label, help] of Object.entries(entries)) {
      labels.add(label);
      labels.add(help);
    }
    if (cyrillic.test(section)) labels.add(section);
  }
  for (const label of labels) {
    if (!cyrillic.test(label)) continue; // timeframes and technical indicators
    for (const language of ['en','pl'] as const) {
      const translated = translateHookChartPhrase(language, label);
      assert.notEqual(translated, label, `${language}: untranslated strategy or help: ${label}`);
      assert.doesNotMatch(translated, cyrillic);
    }
  }
});
