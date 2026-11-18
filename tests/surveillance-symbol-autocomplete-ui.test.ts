import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { translateKey } from '../src/locales';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const page = read('src/components/SurveillancePage.tsx');
const server = read('server.ts');

test('surveillance autocomplete is scoped to the exchange, market and typed base symbol', () => {
  assert.match(page, /symbolSearchKey =/);
  assert.match(page, /new URLSearchParams\(\{\s*q: searchText, exchange: selectedExchange, marketType: selectedMarketType/);
  assert.match(page, /300\);\s*return \(\) => \{ window\.clearTimeout\(timeout\); controller\.abort\(\); \}/);
  assert.match(page, /symbolSearch\.key === symbolSearchKey/);
  assert.match(page, /maxLength=\{40\}/);
  assert.match(page, /role="combobox"/);
  assert.match(page, /role="listbox"/);
  assert.match(page, /role="option"/);
  assert.match(page, /onClick=\{\(\) => chooseSymbolSuggestion\(option\.symbol\)\}/);
  assert.match(page, /chooseSymbolSuggestion\(symbolOptions\[activeSymbolOption\]/);
});

test('iPhone autocomplete options stay inside the scrollable form instead of being clipped as an absolute overlay', () => {
  assert.match(page, /id="surveillance-symbol-options"/);
  assert.match(page, /className="relative z-10 mt-1 max-h-48 overflow-y-auto/);
  assert.doesNotMatch(page, /className="absolute inset-x-0 top-full z-30 mt-1 max-h-48/);
  assert.match(page, /className="min-h-11 w-full min-w-0 rounded-lg/);
});

test('tapping outside the symbol suggestions dismisses them without losing touch selection', () => {
  assert.match(page, /ref=\{symbolSearchContainerRef\} className="relative"/);
  assert.match(page, /document\.addEventListener\('pointerdown', closeOutside\)/);
  assert.match(page, /document\.addEventListener\('focusin', closeOutside\)/);
  assert.match(page, /document\.removeEventListener\('pointerdown', closeOutside\)/);
  assert.match(page, /symbolSearchContainerRef\.current\?\.contains\(target\)/);
});

test('autocomplete uses only the shared cached exchange ticker catalog and sends at most eight pairs', () => {
  assert.match(server, /app\.get\('\/api\/surveillance\/symbols'/);
  assert.match(server, /await marketTickerFeed\.get\(exchange, marketType\)/);
  assert.match(server, /searchSurveillanceSymbols\(query, catalog, 8\)/);
  assert.match(server, /marketTickerFeed\.status\(exchange, marketType\)/);
  assert.match(server, /if \(!catalog\.length \|\| status === 'unavailable'\)/);
  assert.match(server, /if \(!query\.trim\(\) \|\|/);
  assert.match(server, /private, no-store/);
});

test('new symbol search statuses are localized in Ukrainian, English, Polish, Russian', () => {
  const keys = ['surveillance.ui.searchMatches', 'surveillance.ui.searchingSymbols',
    'surveillance.ui.noSymbolMatches', 'surveillance.ui.symbolHint'];
  for (const key of keys) {
    assert.ok(page.includes(key), 'UI must use ' + key);
    const translations = ['uk', 'en', 'pl', 'ru'] as const;
    for (const lang of translations) {
      const value = translateKey(lang, key);
      assert.ok(value && value !== key, lang + ' missing ' + key);
    }
  }
});

test('edited surveillance form and API still parse as TypeScript/TSX', () => {
  for (const [path, kind] of [
    ['src/components/SurveillancePage.tsx', ts.ScriptKind.TSX],
    ['src/utils/marketSymbols.ts', ts.ScriptKind.TS],
    ['server.ts', ts.ScriptKind.TS],
  ] as const) {
    const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, kind);
    const diagnostics = (source as ts.SourceFile & {
      parseDiagnostics?: readonly ts.Diagnostic[];
    }).parseDiagnostics || [];
    assert.deepEqual(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), [],
      path + ' has syntax diagnostics');
  }
});
