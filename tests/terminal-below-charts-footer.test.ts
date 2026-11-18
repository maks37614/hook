import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const terminal = () => read('../src/components/TerminalPage.tsx');
const controls = () => {
  const source = terminal();
  const start = source.indexOf('const terminalChartActions = (');
  const end = source.indexOf('// One autoscale action', start);
  assert.ok(start >= 0 && end > start, 'the Terminal bottom controls exist');
  return source.slice(start, end);
};

test('Terminal centers a single large add button, small pager and found count above the shared footer', () => {
  const source = terminal();
  assert.match(source, /import \{ SiteFooter \} from '\.\/SiteFooter'/);
  const content = controls();
  const addButton = content.indexOf("aria-label={t('terminal.page.addGraph')}");
  const pager = content.indexOf('<nav aria-label={t(\'terminal.page.pageNavigation\')}');
  const found = content.indexOf("t('terminal.page.foundCoins'");
  const footer = content.indexOf('<SiteFooter />');
  assert.ok(addButton >= 0 && pager > addButton && found > pager && footer > found);
  assert.match(content, /className="flex h-14 w-14 items-center justify-center rounded-full/);
  assert.match(content, /<Plus className="h-7 w-7"/);
  assert.match(content, /<ChevronLeft className="h-3\.5 w-3\.5"/);
  assert.match(content, /<ChevronRight className="h-3\.5 w-3\.5"/);
  assert.doesNotMatch(content, /terminal\.page\.coinsCount|terminal\.preset\.shown|terminal\.workspace\.summary/);
  assert.doesNotMatch(content, /presetPagination|workspace\.page/);
});

test('Only one pager is mounted: automatic preset matches first, manual workspace pages otherwise', () => {
  const source = terminal();
  const content = controls();
  assert.match(source, /const isPresetPaged = isAutomaticMarketSelection/);
  assert.match(source, /const foundCoinCount = activeMarketPreset \? presetMatches\.length : marketCoins\.length/);
  assert.match(source, /const canGoBack = isPresetPaged/);
  assert.match(source, /const canGoForward = isPresetPaged/);
  assert.match(source, /goToPresetPage\(visiblePresetPage\.page \+ direction\)/);
  assert.match(source, /setWorkspacePage\(current => Math\.max\(0, Math\.min\(workspacePageCount - 1, current \+ direction\)\)\)/);
  assert.match(content, /disabled=\{!canGoBack\}/);
  assert.match(content, /disabled=\{!canGoForward\}/);
  assert.equal((content.match(/<nav /g) ?? []).length, 1);
});

test('Top coin counter equals mounted chart panels on the active workspace page', () => {
  const source = terminal();
  const paging = source.indexOf('const visibleWorkspaceBlocks = useMemo');
  const count = source.indexOf('const terminalCoinCount = visibleWorkspaceBlocks.length');
  const header = source.indexOf("t('terminal.page.coinsCount', { count: terminalCoinCount })", count);
  assert.ok(paging >= 0 && count > paging && header > count);
  assert.doesNotMatch(source, /const terminalCoinCount = blocks\.length/);
  assert.match(source, /blocks\.slice\(\s*visibleWorkspaceStart, visibleWorkspaceStart \+ workspacePageSize/);
});

test('Footer stays below the same chart grid for one or multiple coins', () => {
  const source = terminal();
  const list = source.indexOf('{visibleWorkspaceBlocks.map((block, index)');
  assert.ok(list >= 0 && source.indexOf('{terminalBelowCharts}', list) > list);
  assert.equal((source.match(/\{terminalBelowCharts\}/g) ?? []).length, 1);
  assert.doesNotMatch(source.slice(list, source.indexOf('{terminalBelowCharts}', list)), /min-h-\[320px\]/);
  assert.doesNotMatch(source, /ref=\{chartListRef\} className="h-full w-full overflow-y-auto no-scrollbar"/);
  assert.match(source, /ref=\{chartListRef\} className="w-full h-full p-2 sm:p-3 overflow-y-auto no-scrollbar"/);
  assert.match(read('../src/components/SiteFooter.tsx'), /getLegalCopy\(language\)/);
});

test('Centered controls provide translations in all four site languages', () => {
  const translations = read('../src/locales/terminalPage20261115.ts');
  for (const key of ['terminal.page.addGraph', 'terminal.page.previous', 'terminal.page.next', 'terminal.page.foundCoins']) {
    assert.ok(translations.includes('"' + key + '"'), key);
  }
  for (const text of [
    'Знайдено {{count}} монет', 'Found {{count}} coins',
    'Найдено {{count}} монет', 'Znaleziono {{count}} monet',
    'Назад', 'Previous', 'Далее', 'Dalej',
  ]) assert.ok(translations.includes(text), text);
});

test('empty Terminal moves the existing plus and live coin count into the workspace', () => {
  const source = terminal();
  const start = source.indexOf('{blocks.length === 0 ? (');
  const grid = source.indexOf('<div className={`terminal-workspace-grid', start);
  assert.ok(start >= 0 && grid > start, 'empty branch must precede the regular grid');
  const empty = source.slice(start, grid);
  assert.match(empty, /data-testid="terminal-empty-workspace"/);
  assert.match(empty, /\{terminalChartActions\}/);
  assert.doesNotMatch(empty, /Робоча область порожня|Додати перший графік|2,400\+|border-dashed/);
  assert.equal((source.match(/\{terminalChartActions\}/g) ?? []).length, 2,
    'one shared element is reused, not duplicated');
  assert.match(source, /\{blocks.length !== 0 && <>\{terminalBelowCharts\}<\/>\}/);
  assert.match(source, /\{blocks.length === 0 && <SiteFooter \/>\}/);
  assert.doesNotMatch(source, /Multi-chart Grid Layout/,
    'the old debug label must not appear in Terminal source or page');
});
