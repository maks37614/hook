import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { supportedLanguages, translatePhrase } from '../src/locales';

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const linking = read('../src/components/profile/ProfileTerminalLinkingSettings.tsx');
const tpsl = read('../src/components/TpSlConstructorModal.tsx');
const profile = read('../src/components/UserProfileModal.tsx');
const notifications = read('../src/components/profile/ProfileNotificationSettings.tsx');

test('profile navigation and important statuses update directly with selected language', () => {
  for (const label of ['Профіль', 'Інтерфейс', 'Графік', 'Пошук', 'Лінковка', 'Сповіщення']) {
    assert.ok(profile.includes("translatePhrase(language, '" + label + "')"), 'Unlocalized profile tab: ' + label);
  }
  assert.match(profile, /aria-label=\{translatePhrase\(language, 'Розділи профілю'\)\}/);
  assert.match(profile, /translatePhrase\(language, sessionsOpen \? 'Згорнути' : 'Переглянути'\)/);
  assert.match(profile, /toLocaleUpperCase\(dateLocale\)/);
  assert.match(profile, /toLocaleDateString\(dateLocale\)/);
  assert.match(profile, /data-no-translate className="text-sm font-bold text-white tracking-wide"/);
  assert.match(profile, /data-no-translate className="text-\[11px\] text-slate-400">\{user.email\}/);
  assert.match(profile, /data-no-translate className="truncate text-slate-200">\{session.userAgent/);
});

test('terminal connection status remains a source template and can change languages while displayed', () => {
  assert.match(linking, /sourceLabel\?: string; copied\?: boolean/);
  assert.match(linking, /text: 'Неправильний формат групи для:', sourceLabel:/);
  assert.match(linking, /text: 'MetaScalp знайдено на локальному порту \{port\}\. Це перевірка з’єднання без перемикання монети\.', port/);
  assert.match(linking, /setMessage\(\{ ok: result\.ok, text: result\.message \}\)/);
  assert.match(linking, /setMessage\(\{ ok: result\.success, text: result\.message, copied: result\.copiedToClipboard \}\)/);
  assert.match(linking, /translatePhrase\(language, message\.text\)\.replace\('\{port\}'/);
  assert.match(linking, /message\.sourceLabel \? ' ' \+ translatePhrase\(language, message\.sourceLabel\)/);
  assert.match(linking, /message\.copied \? ' · ' \+ translatePhrase\(language, 'Скопійовано до буфера\.'\)/);
  assert.match(linking, /translatePhrase\(language, busy \? 'Збереження…' : 'Зберегти налаштування'\)/);
  assert.doesNotMatch(linking, /setMessage\(\{ ok: result\.ok, text: translatePhrase/);
});

test('TP/SL template labels, loading feedback and save state are localized without altering calculations', () => {
  assert.match(tpsl, /translatePhrase\(language, custom \? 'Власний шаблон для цієї області дії'/);
  assert.match(tpsl, /translatePhrase\(language, draft\.enabled \? 'Персональні правила активні після збереження'/);
  assert.match(tpsl, /translatePhrase\(language, saving \? 'Збереження…' : 'Зберегти правила'\)/);
  assert.match(tpsl, /translatePhrase\(language, 'Повернути розрахунок TP через R:R'\)/);
  assert.match(tpsl, /translatePhrase\(language, 'Завантаження реальних свічок…'\)/);
  assert.match(tpsl, /<TpSlConstructorChart candles=\{candles\} levels=\{levels\} onDrag=\{move\}\/>/);
  assert.match(tpsl, /calculateATR/);
});

test('notification controls have localized accessible text and user melodies are never translated', () => {
  for (const key of ['1 хвилина','5 хвилин','15 хвилин','Дзвін','М’який','Подвійний імпульс','Моя мелодія']) {
    assert.ok(notifications.includes("translatePhrase(language, '" + key + "')"), 'Missing option ' + key);
  }
  assert.match(notifications, /aria-label=\{translatePhrase\(language, "Вибрати одну зі своїх мелодій"\)\}/);
  assert.match(notifications, /<option data-no-translate key=\{track\.id\} value=\{track\.id\}>\{customSoundDisplayName\(track\.name\)\}<\/option>/);
  assert.match(notifications, /onChange=\{e => update\(\{ impulseWindowMinutes:/);
  assert.match(notifications, /onChange=\{e => update\(\{ sound:/);
});

test('core UI phrases are available for Ukrainian, English, Russian and Polish', () => {
  assert.deepEqual([...supportedLanguages].sort(), ['en','pl','ru','uk']);
  for (const language of supportedLanguages) {
    for (const source of [
      'Неправильний формат групи для:',
      'MetaScalp знайдено на локальному порту {port}. Це перевірка з’єднання без перемикання монети.',
      'Власний шаблон для цієї області дії',
      'Шаблон успадковано від глобальних правил',
      'Персональні правила активні після збереження',
      'Вибрати одну зі своїх мелодій',
    ]) {
      assert.ok(translatePhrase(language, source).trim(), language + ': missing ' + source);
    }
  }
  assert.match(translatePhrase('en','Власний шаблон для цієї області дії'), /[A-Za-z]/);
  assert.match(translatePhrase('pl','Неправильний формат групи для:'), /[A-Za-z]/);
});
