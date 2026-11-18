import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const regular = read('src/components/FormationCard.tsx');
const early = read('src/components/EarlyFormationCard.tsx');
const terminal = read('src/components/terminal/TerminalChartWidget.tsx');
const css = read('src/index.css');

test('formation cards keep long coin names and early scenarios within their own header', () => {
  assert.ok(regular.includes('className="flex min-w-0 items-start justify-between gap-2"'));
  assert.ok(regular.includes('min-w-0 truncate font-extrabold text-base text-white tracking-wide font-mono'));
  assert.ok(regular.includes('className="shrink-0 text-right"'));
  assert.ok(regular.includes('className="shrink-0 text-xs text-slate-400 font-mono"'));
  assert.ok(early.includes(`{tr(coin.marketType === 'futures' ? "Ф'ючерси" : 'Спот')}`));
  assert.ok(early.includes('className="block min-w-0 flex-1 truncate font-bold text-xs text-slate-200"'));
  assert.ok(early.includes('className="shrink-0 text-xs text-slate-400 font-mono"'));
  for (const component of [regular, early]) {
    assert.ok(component.includes('h-[350px]'));
    assert.ok(component.includes('h-[390px]'));
    assert.ok(component.includes('formation-chart-card'));
    assert.ok(component.includes('<FormationCoinCopyButton'));
  }
});

test('keyboard focus highlights only info cards and Terminal header buttons, never chart canvas', () => {
  for (const component of [regular, early]) {
    assert.ok(component.includes("data-ui-a11y={isChartExpanded ? undefined : 'formation-info'}"));
  }
  assert.ok(css.includes('#root [data-ui-a11y="formation-info"] :is(button, select):focus-visible'));
  assert.ok(css.includes('#root .terminal-chart-header button:focus-visible'));
  const start = css.indexOf('/* Keyboard focus is scoped');
  const end = css.indexOf('/* Formations quick-chart header', start);
  assert.ok(start >= 0 && end > start);
  const rules = css.slice(start, end);
  assert.doesNotMatch(rules, /\b(canvas|filter|transform|animation)\s*:/);
});

test('Terminal chart action names are localized with existing translation mechanism', () => {
  const start = terminal.indexOf('const terminalToolbarControls');
  const end = terminal.indexOf('const terminalToolbarMenus', start);
  assert.ok(start >= 0 && end > start);
  const header = terminal.slice(start, end);
  assert.ok((header.match(/aria-label=/g) ?? []).length >= 8);
  assert.ok(header.includes('text-[10px] px-1.5 py-0.5 rounded font-bold uppercase'));
  assert.ok(header.includes('onClick={onRemove}'));
  assert.ok(header.includes('onUpdateBlock({'));
  assert.ok(header.includes('t("terminal.widget.metaScalp", { group: metaScalpBinding })'));
  assert.ok(terminal.includes('terminalMode={useIntegratedHookChartToolbar}'));
  assert.ok(terminal.includes('historyLimit={isMaximized || isSingleBlock || isOnlyChart ? 1000 : 180}'));
});
