import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/WatchlistDrawer.tsx', import.meta.url), 'utf8');

test('Folder choices use custom dark styling, not the OS-native white select popup', () => {
  assert.match(source, /data-watchlist-folder-menu/);
  assert.match(source, /role="listbox"/);
  assert.match(source, /role="option"/);
  assert.match(source, /bg-\[#070c20\]/);
  assert.match(source, /bg-slate-800 text-cyan-300/);
  assert.match(source, /<Check className="h-4 w-4"/);
  assert.match(source, /aria-selected=\{selectedFolder === folder\}/);
  assert.ok(source.includes("folder || t('ui.watchlist.general')"));
  assert.doesNotMatch(source, /<select\s+value=\{getFolderForEntry\(entry\)\}/);
});

test('Folder picker only changes presentation: assignments still use moveCoin and existing data', () => {
  assert.match(source, /onClick=\{\(\) => \{\s*moveCoin\(entry, folder\);/);
  assert.match(source, /onFoldersChange\(next\)/);
  assert.match(source, /const selectedFolder = getFolderForEntry\(entry\)/);
  assert.match(source, /return \['', \.\.\.folderNames\]\.map/);
  assert.match(source, /aria-haspopup="listbox"/);
  assert.match(source, /aria-expanded=\{folderMenu\?\.entryKey === entry\.key\}/);
});

test('Dark folder list is viewport-bounded, supports narrow devices and closes on outside/keyboard', () => {
  assert.match(source, /getBoundingClientRect\(\)/);
  assert.match(source, /document\.documentElement\.clientWidth/);
  assert.match(source, /window\.innerHeight/);
  assert.match(source, /const openAbove = spaceAbove > spaceBelow/);
  assert.match(source, /maxHeight: folderMenu\.maxHeight/);
  assert.match(source, /overflow-y-auto overscroll-contain rounded-xl/);
  assert.match(source, /onMouseDown=\{\(\) => setFolderMenu\(null\)\}/);
  assert.match(source, /onKeyDown=\{onFolderMenuKeyDown\}/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /'ArrowDown', 'ArrowUp', 'Home', 'End'/);
  assert.match(source, /document\.addEventListener\('scroll', closeOnPositionChange, true\)/);
});
