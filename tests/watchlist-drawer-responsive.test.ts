import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const drawer = readFileSync(new URL('../src/components/WatchlistDrawer.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/watchlistDrawer.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

test('Favorites drawer is above charts, viewport-sized and internally scrollable', () => {
  assert.match(drawer, /import \{ createPortal \} from 'react-dom'/);
  assert.match(drawer, /return createPortal\(/);
  assert.match(drawer, /document\.body\s*\n\s*\);/);
  assert.match(drawer, /fixed left-0 top-0 z-\[270\] flex h-\[100dvh\] w-screen min-h-0 items-start justify-end overflow-hidden/);
  assert.match(drawer, /role="dialog"/);
  assert.match(drawer, /aria-modal="true"/);
  assert.match(drawer, /aria-labelledby="watchlist-drawer-title"/);
  assert.ok(drawer.includes("aria-label={t('ui.watchlist.close')}"));
  assert.match(drawer, /event\.key === 'Escape'/);
  assert.match(drawer, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(drawer, /document\.body\.style\.overflow = oldBodyOverflow/);
  assert.match(css, /width: min\(100%, 28rem\)/);
  assert.match(css, /height: 100dvh/);
  assert.match(css, /max-height: 100dvh/);
  assert.match(drawer, /watchlist-drawer-list min-h-0 min-w-0 flex-auto/);
  assert.match(drawer, /overflow-x-hidden overflow-y-auto overscroll-contain/);
  assert.match(css, /safe-area-inset-bottom/);
});

test('All favorite-folder form controls use 16px mobile font to avoid iPhone Safari autozoom', () => {
  assert.match(main, /import '\.\/components\/watchlistDrawer\.css'/);
  assert.doesNotMatch(drawer, /import ['"].*\.css['"]/);
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(css, /\.watchlist-drawer input,/);
  assert.match(css, /\.watchlist-drawer select \{\s*font-size: 16px;/);
  assert.match(drawer, /placeholder=\{t\('ui\.watchlist\.newFolder'\)\}[\s\S]*?className="[^"]*text-base/);
  assert.match(drawer, /aria-label=\{t\('ui\.watchlist\.sort'\)\}[\s\S]*?className="[^"]*text-base/);
  assert.ok(drawer.includes("t('ui.watchlist.folderFor', { symbol: entry.symbol, exchange: entry.exchange })"));
  assert.match(drawer, /aria-haspopup="listbox"/);
  assert.doesNotMatch(main, /user-scalable=no|maximum-scale=1/);
});

test('Narrow favorite cards wrap exchange, price and controls while keeping behavior intact', () => {
  assert.match(drawer, /flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2/);
  assert.match(drawer, /basis-\[120px\] flex-wrap items-center/);
  assert.match(drawer, /basis-\[185px\] flex-wrap items-center justify-end/);
  assert.match(drawer, /min-w-0 truncate/);
  assert.match(drawer, /max-w-\[165px\] flex-1/);
  assert.match(drawer, /onClick=\{createFolder\}/);
  assert.match(drawer, /onClick=\{\(event\) => openFolderMenu\(entry, event\.currentTarget\)\}/);
  assert.match(drawer, /onClick=\{\(\) => removeCoin\(entry\)\}/);
  assert.match(drawer, /watchlistSymbols\.map\(getCoinWatchlistKey\)/);
  assert.match(drawer, /fetch\('\/api\/market\/favorite-quotes'/);
});
