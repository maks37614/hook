import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const widget = read('src/components/terminal/TerminalChartWidget.tsx');
const css = read('src/index.css');

test('long coin symbols and prices stay in bounded columns inside the Terminal popup', () => {
  const start = widget.indexOf('{/* In-place Coin Switcher Popover */}');
  const end = widget.indexOf('{isSpanPickerOpen && (', start);
  assert.ok(start >= 0 && end > start, 'coin menu exists');
  const picker = widget.slice(start, end);
  assert.match(picker, /terminal-chart-coin-list max-h-48 overflow-y-auto/);
  assert.match(picker, /flex w-full min-w-0 items-center justify-between gap-2/);
  assert.match(picker, /flex min-w-0 flex-1 items-center gap-1.5/);
  assert.match(picker, /min-w-0 truncate font-mono font-bold text-white/);
  assert.match(picker, /title=\{c\.symbol\}/);
  assert.match(picker, /max-w-\[48%\] shrink-0 truncate font-mono/);
  assert.match(picker, /formatTerminalQuotedPrice\(c\.currentPrice, c\.quoteAsset\)/);
  assert.match(picker, /aria-label=\{translatePhrase\(language, 'Швидкий пошук\.\.\.'\)\}/);
  for (const prop of ['symbol: c.symbol', 'exchange: c.exchange', 'marketType: c.marketType']) {
    assert.ok(picker.includes(prop), prop + ' preserved');
  }
});

test('narrow Terminal resize-menu options wrap without changing width or height actions', () => {
  assert.match(widget, /terminal-chart-header-popover terminal-chart-span-menu absolute right-2/);
  assert.match(css, /#root \.terminal-chart-span-menu > button \{/);
  assert.match(css, /overflow-wrap: anywhere;/);
  assert.match(css, /white-space: normal;/);
  for (const option of ['colSpan: 1', 'colSpan: 2', 'colSpan: 3', "colSpan: 'full'", 'heightPx: undefined', 'px: 280', 'px: 380', 'px: 480', 'px: 620']) {
    assert.ok(widget.includes(option), option + ' preserved');
  }
});

test('Terminal menu scrollbar cannot affect HookChart canvases, feeds, or chart dimensions', () => {
  assert.match(css, /#root \.terminal-chart-coin-list \{/);
  assert.match(css, /#root \.terminal-chart-coin-list::-webkit-scrollbar \{/);
  const begin = css.indexOf('/* Show a scrollbar only for');
  const end = css.indexOf('/* Chart controls respond to their own block', begin);
  assert.ok(begin >= 0 && end > begin);
  assert.doesNotMatch(css.slice(begin, end), /(?:canvas|\.hookchart-root|WebSocket|fetch\()/);
  assert.match(widget, /terminalMode=\{useIntegratedHookChartToolbar\}/);
  assert.match(widget, /historyLimit=\{isMaximized \|\| isSingleBlock \|\| isOnlyChart \? 1000 : 180\}/);
});
