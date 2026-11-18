import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screener = readFileSync(new URL('../src/components/CoinScreenerPage.tsx', import.meta.url), 'utf8');
const copyButton = readFileSync(new URL('../src/components/ScreenerCopySymbolButton.tsx', import.meta.url), 'utf8');

test('Screener renders a compact copy button next to the coin name in both table and card views', () => {
  assert.match(screener, /import \{ ScreenerCopySymbolButton \} from '\.\/ScreenerCopySymbolButton'/);
  assert.equal((screener.match(/<ScreenerCopySymbolButton symbol=\{coin\.symbol\} \/>/g) ?? []).length, 2);
  assert.match(screener, /className="text-\[10px\] text-slate-500">\/USDT<\/span>\s*<ScreenerCopySymbolButton symbol=\{coin\.symbol\}/);
  assert.match(screener, /className="text-xs text-slate-500 font-mono">\/USDT<\/span>\s*<ScreenerCopySymbolButton symbol=\{coin\.symbol\}/);
});

test('Screener copy button stops parent chart navigation and copies only the complete market symbol', () => {
  assert.match(copyButton, /event\.stopPropagation\(\)/);
  assert.match(copyButton, /copyTextToClipboard\(symbol\.toUpperCase\(\)\)/);
  assert.match(copyButton, /type="button"/);
  assert.match(copyButton, /aria-label=\{t\('ui\.copy\.symbol', \{ symbol: formattedSymbol \}\)\}/);
  assert.match(copyButton, /<Copy aria-hidden="true"/);
  assert.match(copyButton, /<Check aria-hidden="true"/);
  assert.match(copyButton, /h-6 w-6 shrink-0/);
  assert.doesNotMatch(copyButton, /onSelectCoin|handleCoinClick|window\.location/);
});
