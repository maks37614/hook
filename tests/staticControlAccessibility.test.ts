import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../src/styles/accessibilityControls.css');
const main = read('../src/main.tsx');
const table = read('../src/components/ScreenerTable.tsx');
const card = read('../src/components/FormationCard.tsx');
const watchlist = read('../src/components/WatchlistDrawer.tsx');
const header = read('../src/components/Header.tsx');

test('static a11y stylesheet shares the existing bundle', () => {
  assert.match(main, /import '\.\/styles\/accessibilityControls\.css';/);
});

test('focus rings are paint-only, keyboard-only and never target chart or replay', () => {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const rules = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  assert.equal(rules.length, 2);
  assert.equal(clean.replace(/([^{}]+)\{([^{}]*)\}/g, '').trim(), '');

  const focusedSelectors = rules[0][1].trim().split(',\n').map(s => s.trim());
  assert.equal(focusedSelectors.length, 13);
  assert.ok(focusedSelectors.some(selector => selector.includes('[data-ui-a11y="auth-modal"]')));
  assert.ok(focusedSelectors.some(selector => selector.includes('[data-ui-a11y="profile-account"]')));
  assert.ok(focusedSelectors.some(selector => selector.includes('[data-ui-a11y="archive-modal"]')));
  assert.ok(focusedSelectors.some(selector => selector.includes('[data-ui-a11y="telegram-alerts-modal"]')));
  for (const selector of focusedSelectors) {
    assert.match(selector, /^#root /);
    assert.match(selector, /:focus-visible$/);
    assert.doesNotMatch(selector, /hookchart|chartWrap|replay|canvas|terminal-chart/i);
  }
  assert.match(rules[0][2], /outline:\s*2px solid var\(--site-a11y-focus-color, var\(--color-cyan-400\)\)/);
  assert.match(rules[0][2], /outline-offset:\s*-2px/);
  assert.match(rules[1][1], /html\[data-site-surface="mist"\]/);
  assert.match(rules[1][1], /html\[data-site-surface="mint"\]/);
  assert.match(rules[1][2], /--site-a11y-focus-color:\s*var\(--color-cyan-700\)/);
  assert.doesNotMatch(clean, /(?:^|[;{}\s])(?:filter|backdrop-filter|animation|transition|transform|box-shadow|width|height|padding|margin|font-size|opacity|will-change)\s*:/i);
});

test('icon-only screener actions use existing translated messages', () => {
  assert.match(table, /aria-label=\{tr\(isWatchlisted \? 'Видалити з обраного' : 'Додати в обране'\)\}/);
  assert.match(table, /aria-pressed=\{isWatchlisted\}/);
  for (const key of [
    'i18n.formationTable.terminalGroup',
    'i18n.formationTable.telegram',
    'i18n.formationTable.openChart',
  ]) {
    assert.ok(table.includes('aria-label={t(\'' + key + '\''), 'missing label for ' + key);
  }
});

test('formation labels are scoped to information cards rather than the expanded chart', () => {
  assert.match(card, /data-ui-a11y=\{isChartExpanded \? undefined : 'formation-info'\}/);
  const detailsStart = card.indexOf('{/* Footer Actions */}');
  assert.ok(detailsStart > 0);
  const details = card.slice(detailsStart);
  assert.match(details, /aria-pressed=\{isMonitored\}/);
  assert.match(details, /aria-pressed=\{isWatchlisted\}/);
  assert.match(details, /aria-label=\{tr\("Відкрити графік на цілий блок"\)\}/);
  assert.match(details, /aria-label=\{tr\("Повний детальний огляд монети"\)\}/);
});

test('watchlist and logo expose state and localized accessible names', () => {
  assert.match(watchlist, /aria-expanded=\{!collapsedFolders\[group.name \|\| 'unfiled'\]\}/);
  assert.match(watchlist, /aria-label=\{t\('ui.watchlist.sortDirection'\)\}/);
  assert.match(header, /aria-label=\{tr\("Головна сторінка: Скрінер"\)\}/);
});
