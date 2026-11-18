import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interpolate, locales, translateKey } from '../src/locales';
import { watchlistUiRows } from '../src/locales/watchlistUi20261115';
const languages = ['uk', 'en', 'ru', 'pl'] as const;
const params = (value: string) => [...value.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)].map(x => x[1]).sort();
test('Watchlist drawer has complete Ukrainian, English, Russian and Polish UI', () => {
  const names = new Set<string>();
  for (const row of watchlistUiRows) {
    assert.equal(row.length, 5);
    assert.ok(!names.has(row[0]), row[0]);
    names.add(row[0]);
    const variables = Object.fromEntries(params(row[1]).map(key => [key, '42']));
    for (const [index, language] of languages.entries()) {
      const key = 'ui.watchlist.' + row[0];
      assert.deepEqual(params(row[index + 1]), params(row[1]));
      assert.equal(locales[language].strings[key], row[index + 1]);
      assert.equal(translateKey(language, key, variables), interpolate(row[index + 1], variables));
    }
  }
});
test('Watchlist displays translated statuses, folders and symbol actions without changing keys', () => {
  const src = readFileSync(new URL('../src/components/WatchlistDrawer.tsx', import.meta.url), 'utf8');
  for (const key of ['quoteLoading','quoteRetry','quoteUnavailable','quoteMissing','quoteWaiting',
    'general','folderFor','coinActionsFor','copied','copyFailed','copySymbol']) {
    assert.ok(src.includes('ui.watchlist.' + key));
  }
  assert.ok(src.includes('moveCoin(entry, folder)'));
  assert.ok(src.includes('watchlistSymbols.map(getCoinWatchlistKey)'));
  assert.equal(translateKey('en', 'ui.watchlist.copied', { symbol: 'SOLUSDT' }), 'Copied: SOLUSDT');
  assert.equal(translateKey('pl', 'ui.watchlist.general'), 'Lista ogólna');
});
