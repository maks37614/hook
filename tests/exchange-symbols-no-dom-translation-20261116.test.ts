import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CopyableCoinSymbol } from '../src/components/CopyableCoinSymbol';
import { FormationCoinCopyButton } from '../src/components/FormationCoinCopyButton';

const read = (file: string): string => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('DOM translations deliberately skip raw exchange symbols without disabling UI translations', () => {
  const context = read('src/context/LanguageContext.tsx');
  assert.match(context, /parent\.closest\('\[data-no-translate\], script, style, noscript, code, pre'\)/);
  assert.match(context, /if \(element\.closest\('\[data-no-translate\]'\)\) return/);
  assert.match(context, /translatePhrase\(language, source\)/);
});

test('copyable symbol widgets protect their own raw text while retaining localized copy controls', () => {
  const assets = ['ON', 'ONE', 'MOVE', 'KEY', 'OPEN', 'HIGH', '龙虾'];
  for (const baseAsset of assets) {
    const display = renderToStaticMarkup(createElement(CopyableCoinSymbol, { baseAsset, quoteAsset: 'USDT' }));
    assert.match(display, /<span data-no-translate/);
    assert.ok(display.includes(baseAsset + '/USDT'), baseAsset + ' must appear unchanged');

    const copy = renderToStaticMarkup(createElement(FormationCoinCopyButton, {
      symbol: baseAsset + 'USDT',
      children: createElement('span', null, baseAsset),
    }));
    assert.match(copy, /data-no-translate/);
    assert.ok(copy.includes(baseAsset), baseAsset + ' cannot be localized in copy button');
    assert.match(copy, /aria-label=/, 'localized accessible copy action remains present');
  }
});

test('Screener shows unmodified exchange base assets in both table and card layouts', () => {
  const screener = read('src/components/CoinScreenerPage.tsx');
  assert.match(screener, /data-no-translate className="font-bold text-white group-hover:text-cyan-400 transition-colors text-sm"/);
  assert.match(screener, /data-no-translate className="font-bold text-white group-hover:text-cyan-400 transition-colors text-base font-mono"/);
  const table = read('src/components/ScreenerTable.tsx');
  assert.match(table, /<FormationCoinCopyButton symbol=\{coin\.symbol\}/);
});

test('watchlists, formations, terminal, Replay, and notifications protect raw symbol labels', () => {
  const cases: Array<[string, RegExp]> = [
    ['src/components/WatchlistDrawer.tsx', /data-no-translate[^>]*>\{watchlistDisplayName\(entry\)\}/],
    ['src/components/ArchiveModal.tsx', /data-no-translate[^>]*>\s*\{item\.baseAsset\}\/\{item\.quoteAsset\}/],
    ['src/components/TerminalPage.tsx', /data-no-translate[^>]*>\s*\{favCoin\.baseAsset\}\/\{favCoin\.quoteAsset\}/],
    ['src/components/terminal/TerminalChartWidget.tsx', /data-no-translate[^>]*>\{block\.symbol\}/],
    ['src/components/terminal/AddChartModal.tsx', /data-no-translate[^>]*>\s*\{coin\.symbol\}/],
    // The header shows the selected chart slot, whose base/quote can differ
    // from activeCoin. Protect both from accidental DOM translation.
    ['src/components/FullscreenChartModal.tsx', /data-no-translate[^>]*>\s*\{headerBase\}\/\{headerQuote\}/],
    ['src/components/SurveillancePage.tsx', /data-no-translate[^>]*>\s*\{coin\.symbol\}/],
    ['src/components/TelegramAlertsModal.tsx', /data-no-translate[^>]*>\s*\{alert\.symbol\}/],
    ['src/components/SiteNotificationBell.tsx', /data-no-translate[^>]*>\{symbol\}/],
    ['src/components/replay/ReplayJournal.tsx', /data-no-translate[^>]*>\s*\{trade\.symbol\}/],
    ['src/components/replay/ReplaySimulatorPanel.tsx', /data-no-translate[^>]*>\s*\{position\.symbol\}/],
    ['src/components/replay/ReplayChart.tsx', /data-no-translate[^>]*>\{symbol\}/],
    ['src/components/replay/ReplayToolbar.tsx', /data-no-translate[^>]*>\s*\{coin\.baseAsset\}/],
    ['src/components/terminal/TerminalPresetPanel.tsx', /<strong data-no-translate>\{block\.symbol\}<\/strong>/],
    ['src/components/fullscreen/FullscreenMultiChart.tsx', /data-no-translate[^>]*>\{symbol\}/],
    ['src/components/TradingViewChart.tsx', /data-no-translate[^>]*>\{symbol\}/],
    ['src/App.tsx', /data-no-translate[^>]*>\s*\{coin\.symbol\}/],
  ];
  for (const [file, expected] of cases) {
    assert.match(read(file), expected, 'unprotected exchange symbol in ' + file);
  }
});
