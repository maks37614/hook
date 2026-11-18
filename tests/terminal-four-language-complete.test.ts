import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { locales, interpolate, supportedLanguages, translateKey, translatePhrase } from '../src/locales';
import { terminalPagePhraseRows, terminalPageStringRows } from '../src/locales/terminalPage20261115';
import { terminalWidgetMoreRows } from '../src/locales/terminalWidgetMore20261116';
import { formatSessionCountdown, sessionDateLabel } from '../src/utils/tradingSessions';
import { localizeTerminalMarketWarning } from '../src/locales/terminalMarketWarnings';

const languages = ['uk', 'en', 'ru', 'pl'] as const;
const placeholders = (s: string) => [...s.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)]
  .map(match => match[1]).sort().join('|');

test('Terminal phrases and templates have complete, consistent translations in four languages', () => {
  assert.deepEqual(supportedLanguages, languages);
  const seenPhrases = new Set<string>();
  for (const row of terminalPagePhraseRows) {
    assert.equal(row.length, 4);
    assert.ok(!seenPhrases.has(row[0]), 'duplicate phrase: ' + row[0]);
    seenPhrases.add(row[0]);
    for (let i = 0; i < 4; i++) {
      assert.ok(row[i].trim(), 'empty phrase: ' + row[0] + ' / ' + languages[i]);
      assert.equal(translatePhrase(languages[i], row[0]), row[i], 'wrong phrase: ' + row[0] + ' / ' + languages[i]);
    }
  }
  const seenKeys = new Set<string>();
  for (const row of terminalPageStringRows) {
    assert.equal(row.length, 5);
    assert.ok(!seenKeys.has(row[0]), 'duplicate string key: ' + row[0]);
    seenKeys.add(row[0]);
    const expected = placeholders(row[1]);
    for (let i = 1; i < 5; i++) {
      assert.ok(row[i].trim(), 'empty string: ' + row[0]);
      assert.equal(placeholders(row[i]), expected, 'placeholder mismatch: ' + row[0]);
      assert.equal(locales[languages[i - 1]].strings[row[0]], row[i], 'unregistered key: ' + row[0]);
      const params = Object.fromEntries([...row[1].matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)].map(match => [match[1], '42']));
      assert.equal(translateKey(languages[i - 1], row[0], params), interpolate(row[i], params));
    }
  }
});

test('Terminal interface, market presets, trading sessions and feedback are localized', () => {
  assert.equal(translatePhrase('en', 'Показувати годинник'), 'Show clock');
  assert.equal(translatePhrase('pl', 'Прокручування доступне у режимі кількох графіків'),
    'Przewijanie jest dostępne w trybie wielu wykresów');
  assert.equal(translatePhrase('en', 'Сідней'), 'Sydney');
  assert.equal(translatePhrase('pl', 'Нью-Йорк'), 'Nowy Jork');
  assert.equal(translatePhrase('ru', 'Топ ріст 24г'), 'Лидеры роста за 24 ч');
  assert.equal(translateKey('en', 'terminal.presets.saved', { name: 'Test', count: 3 }),
    'Preset “Test” saved. Coins: 3.');
  assert.equal(translateKey('pl', 'terminal.clock.activeCount', { count: 2 }), 'Aktywne sesje: 2');
  assert.equal(translateKey('ru', 'terminal.modal.moreCoins', { count: 45 }),
    'Показать ещё 80 монет (осталось 45)...');
  assert.equal(translateKey('pl', 'terminal.backup.importConfirm', { charts: 3, presets: 1 }),
    'Zaimportować wykresy (3) i presety (1)? Bieżąca przestrzeń robocza zostanie zastąpiona. Zalecamy najpierw wyeksportować jej kopię JSON.');
});

test('Dynamic exchange warnings keep market identities while translating their status', () => {
  assert.equal(localizeTerminalMarketWarning('en', 'Binance Futures: показано останні отримані дані (Помилка з’єднання)'),
    'Binance Futures: showing last received data (Connection error)');
  assert.equal(localizeTerminalMarketWarning('pl', 'Bybit Spot: дані недоступні'),
    'Bybit Spot: dane niedostępne');
  assert.equal(localizeTerminalMarketWarning('ru', 'Binance Futures: дані недоступні'),
    'Binance Фьючерсы: данные недоступны');
});

test('Trading session dates and duration follow the selected site language', () => {
  const a = new Date('2026-11-16T09:00:00.000Z');
  const b = new Date('2026-11-16T17:00:00.000Z');
  assert.match(sessionDateLabel(a, b, 'UTC', 'uk'), /пн/i);
  assert.match(sessionDateLabel(a, b, 'UTC', 'en'), /Mon/i);
  assert.match(sessionDateLabel(a, b, 'UTC', 'pl'), /pon/i);
  assert.match(sessionDateLabel(a, b, 'UTC', 'ru'), /пн/i);
  assert.equal(formatSessionCountdown(125 * 60000), '2г 5хв');
  assert.equal(formatSessionCountdown(125 * 60000, 'en'), '2h 5m');
  assert.equal(formatSessionCountdown(125 * 60000, 'pl'), '2godz. 5min');
  assert.equal(formatSessionCountdown(125 * 60000, 'ru'), '2ч 5мин');
});

test('Terminal uses translations for dynamic controls, trading-session data and preset confirmations', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const drawer = source('../src/components/terminal/TerminalSettingsDrawer.tsx');
  const page = source('../src/components/TerminalPage.tsx');
  const clock = source('../src/components/terminal/TerminalClock.tsx');
  const presets = source('../src/components/terminal/TerminalPresetPanel.tsx');
  const addChart = source('../src/components/terminal/AddChartModal.tsx');
  const chart = source('../src/components/terminal/TerminalChartWidget.tsx');
  const workspace = source('../src/utils/useTerminalWorkspace.ts');
  assert.match(drawer, /terminal\.workspace\.summary/);
  assert.match(drawer, /terminal\.column\.one/);
  assert.match(drawer, /translatePhrase\(language, item\.sub\)/);
  assert.match(page, /terminal\.page\.metaScalpGroup/);
  assert.match(clock, /sessionDateLabel\(startsAt, endsAt, timeZone, language\)/);
  assert.match(clock, /translatePhrase\(language, session\.city\)/);
  assert.match(clock, /formatSessionCountdown\(nextChangeAt\.getTime\(\) - now\.getTime\(\), language\)/);
  assert.match(presets, /terminal\.presets\.saved/);
  assert.match(presets, /terminal\.presets\.deleted/);
  assert.match(addChart, /terminal\.modal\.moreCoins/);
  assert.match(chart, /terminal\.widget\.metaScalp/);
});

test('Terminal chart card and fullscreen secondary toolbar localize all visible strings', () => {
  const widget = readFileSync(new URL('../src/components/terminal/TerminalChartWidget.tsx', import.meta.url), 'utf8');
  const existing = new Set<string>();
  for (const row of terminalWidgetMoreRows) {
    assert.ok(!existing.has(row[0]), 'duplicate Terminal chart card translation: ' + row[0]);
    existing.add(row[0]);
    for (let index = 0; index < languages.length; index++) {
      const language = languages[index];
      const value = translatePhrase(language, row[0]);
      assert.ok(value.trim(), language + ': empty chart control translation: ' + row[0]);
      if (language === 'en' || language === 'pl') {
        assert.doesNotMatch(value, /[А-Яа-яІіЇїЄєҐґ]/,
          language + ': untranslated chart control: ' + row[0]);
      }
    }
    assert.ok(widget.includes(row[0]), 'chart widget no longer uses reviewed source label: ' + row[0]);
    assert.ok(!widget.includes('title="' + row[0] + '"'),
      'untranslated chart button tooltip: ' + row[0]);
    assert.ok(!widget.includes('aria-label="' + row[0] + '"'),
      'untranslated accessibility label: ' + row[0]);
    assert.ok(!widget.includes('placeholder="' + row[0] + '"'),
      'untranslated input placeholder: ' + row[0]);
  }
  assert.equal(terminalWidgetMoreRows.length, 16);
  assert.match(widget, /translatePhrase\(language, "Змінити монету"\)/);
  assert.match(widget, /translatePhrase\(language, "Налаштувати алерт у Telegram"\)/);
  assert.match(widget, /translatePhrase\(language, "Повна ширина"\)/);
  assert.match(widget, /translatePhrase\(language, "Віджет призупинено/);
});
