import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const archive = read('../src/components/ArchiveModal.tsx');
const telegram = read('../src/components/TelegramAlertsModal.tsx');
const styles = read('../src/styles/accessibilityControls.css');

test('archive dialog and icon actions expose localized accessible names', () => {
  assert.match(archive, /data-ui-a11y="archive-modal" role="dialog" aria-modal="true" aria-label=\{t\("archive\.title"\)\}/);
  assert.match(archive, /title=\{t\("archive\.close"\)\}\s+aria-label=\{t\("archive\.close"\)\}/);
  assert.match(archive, /placeholder=\{t\("archive\.searchPlaceholder"\)\}\s+aria-label=\{t\("archive\.searchPlaceholder"\)\}/);
  assert.match(archive, /title=\{t\("archive\.deleteTitle"\)\}\s+aria-label=.*item\.baseAsset.*item\.quoteAsset/);
});

test('archive exchange and direction filters announce selected state', () => {
  assert.match(archive, /key=\{ex\}\s+type="button"\s+aria-pressed=\{exchangeFilter === ex\}/);
  assert.match(archive, /key=\{b\}\s+type="button"\s+aria-pressed=\{biasFilter === b\}/);
});

test('Telegram modal presents localized view, accordion and refresh state', () => {
  assert.match(telegram, /data-ui-a11y="telegram-alerts-modal" role="dialog" aria-modal="true" aria-label=\{ui\("Сповіщення в Telegram"\)\}/);
  for (const tab of ['alerts', 'history', 'settings']) {
    assert.ok(telegram.includes("aria-pressed={activeTab === '" + tab + "'}"),
      'missing selected state for ' + tab);
  }
  assert.match(telegram, /aria-expanded=\{showCreateForm\}/);
  assert.match(telegram, /title=\{ui\("Оновити список"\)\}\s+aria-label=\{ui\("Оновити список"\)\}/);
});

test('Telegram icon actions distinguish alert symbols without changing behavior', () => {
  for (const action of [
    'Призупинити сповіщення',
    'Відновити сповіщення',
    'Видалити сповіщення',
    'Видалити',
  ]) {
    const match = telegram.split('\n').find(line =>
      line.includes('aria-label=') && line.includes('ui("' + action + '")'));
    assert.ok(match, 'missing accessible icon label for ' + action);
    assert.ok(match.includes('alert.symbol'), 'icon must identify its coin for ' + action);
  }
  assert.match(telegram, /aria-label=.*Видалити з історії.*item\.symbol/);
});

test('archive and Telegram focus styles remain paint-only and away from chart renderers', () => {
  for (const marker of ['archive-modal', 'telegram-alerts-modal']) {
    assert.ok(styles.includes('[data-ui-a11y="' + marker + '"]'),
      'missing isolated dialog focus for ' + marker);
  }
  // Discard explanatory CSS comments before checking the actual selectors.
  const declarations = styles.replace(/\/\*[\s\S]*?\*\//g, '');
  const focusRules = declarations.slice(0, declarations.indexOf('outline: 2px solid'));
  assert.doesNotMatch(focusRules, /hookchart|canvas|replay|terminal-chart/i);
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /(?:^|[;{}\s])(?:animation|transition|filter|backdrop-filter|box-shadow|width|height|padding|font-size|will-change)\s*:/i);
});
