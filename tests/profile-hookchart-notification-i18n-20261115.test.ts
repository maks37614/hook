import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { locales, supportedLanguages, translatePhrase } from '../src/locales';
import { profileNotificationHelpPhrases, profileNotificationHelpRows } from '../src/locales/profileNotificationHelp20261115';

const source = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

test('remaining Profile market and liquidation information is translated in four languages', () => {
  assert.deepEqual([...supportedLanguages].sort(), ['en', 'pl', 'ru', 'uk']);
  assert.equal(profileNotificationHelpRows.length, 2);
  assert.equal(new Set(profileNotificationHelpRows.map(row => row[0])).size, profileNotificationHelpRows.length);
  for (const row of profileNotificationHelpRows) {
    for (const [index, language] of (['uk','en','ru','pl'] as const).entries()) {
      assert.ok(row[index].trim());
      assert.equal(profileNotificationHelpPhrases[language][row[0]], row[index]);
      assert.equal(locales[language].phrases[row[0]], row[index]);
      assert.equal(translatePhrase(language, row[0]), row[index]);
    }
  }
  assert.equal(translatePhrase('en','Усі ринки'),'All markets');
  assert.equal(translatePhrase('pl','Усі ринки'),'Wszystkie rynki');
});

test('notification settings fallback remains recoverable, without reading language from a class hook', () => {
  const errorBoundary = source('../src/components/profile/ProfileNotificationsErrorBoundary.tsx');
  assert.match(errorBoundary, /function LocalizedNotificationFallback/);
  assert.match(errorBoundary, /const \{ language \} = useLanguage\(\)/);
  assert.match(errorBoundary, /class ProfileNotificationsErrorBoundary extends React\.Component/);
  assert.match(errorBoundary, /this\.setState\(\{ failed: false \}\)/);
  assert.match(errorBoundary, /onClose=\{this\.props\.onClose\}/);
  for (const phrase of [
    'Не вдалося відкрити налаштування сповіщень.',
    'Можливо, браузер перервав обробку аудіофайлу. Збережені налаштування не видалено.',
    'Спробувати ще раз', 'Закрити профіль',
  ]) assert.ok(errorBoundary.includes("translate('" + phrase + "')"));
});

test('HookChart save, loading, error and accessible name follow the selected site language', () => {
  const hookchart = source('../src/components/profile/ProfileHookChartSettings.tsx');
  assert.match(hookchart, /translatePhrase\(siteLanguage, 'Завантаження персональних налаштувань графіка…'\)/);
  assert.match(hookchart, /aria-label=\{translatePhrase\(siteLanguage, "Налаштування HookChart у профілі"\)\}/);
  assert.match(hookchart, /translatePhrase\(siteLanguage, error \? 'Помилка збереження' : saving \? 'Зберігаємо…' : 'Збережено у профілі'\)/);
  assert.match(hookchart, /pendingRef\.current = mergeSettings\(delta, pendingRef\.current \|\| \{\}\)/);
  assert.match(hookchart, /<OriginalHookChartSettings/);
});

test('notification explanations, markets and sound warnings remain meaningful after a language change', () => {
  const notifications = source('../src/components/profile/ProfileNotificationSettings.tsx');
  assert.match(notifications, /translatePhrase\(language, 'Усі ринки'\)/);
  assert.match(notifications, /translatePhrase\(language, 'Джерело даних:'\)/);
  assert.match(notifications, /translatePhrase\(language, 'Імпульси та великі ліквідації працюють лише з відкритою сторінкою/);
  assert.match(notifications, /translatePhrase\(language, 'На цьому пристрої раніше вибраної мелодії немає/);
  assert.match(notifications, /translatePhrase\(language, 'Зміни зберігаються автоматично'\)/);
  assert.match(notifications, /translatePhrase\(language, 'Сповіщення обробляються у вашому браузері/);
  assert.match(notifications, /onChange=\{e => update\(\{ impulseWindowMinutes: Number\(e\.target\.value\)/);
  assert.match(notifications, /onChange=\{e => update\(\{ scopeMarket: e\.target\.value/);
});

test('Screener profile search keeps both sort directions and a translated volume-toggle tooltip', () => {
  const search = source('../src/components/profile/ProfileScreenerSearchSettings.tsx');
  assert.match(search, /translatePhrase\(language, 'Усі ринки'\)/);
  assert.match(search, /translatePhrase\(language, 'Межа обсягу за 24 години'\)/);
  assert.match(search, /aria-label=\{translatePhrase\(language, draft\.volumeMode/);
  assert.match(search, /title=\{translatePhrase\(language, draft\.volumeMode/);
  assert.match(search, /translatePhrase\(language, 'За спаданням ↓'\)/);
  assert.match(search, /translatePhrase\(language, 'За зростанням ↑'\)/);
  assert.match(search, /translatePhrase\(language, 'Редагувати'\)/);
  assert.match(search, /translatePhrase\(language, 'Зробити стандартним'\)/);
  assert.match(search, /onClick=\{\(\) => setField\('volumeMode', draft\.volumeMode === 'to' \? 'from' : 'to'\)\}/);
});
