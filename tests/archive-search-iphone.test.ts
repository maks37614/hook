import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const archive = readFileSync(new URL('../src/components/ArchiveModal.tsx', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('archive search uses true 16px computed font, not root-relative 1rem', () => {
  const input = archive.match(/<input\s+type="text"\s+value=\{searchQuery\}[\s\S]*?\/>/)?.[0];
  assert.ok(input, 'The archive search input still exists');
  assert.match(input, /onChange=\{\(e\) => setSearchQuery\(e\.target\.value\)\}/);
  assert.match(css, /html\s*\{\s*font-size:\s*calc\(13\.5px \* var\(--site-text-scale, 1\)\)/, 'the root font scales with the site text-size preference');
  assert.match(input, /text-\[16px\]/, 'explicit pixel value, independent of rem');
  assert.match(input, /style=\{\{ fontSize: '16px' \}\}/, 'inline computed font protection');
  assert.doesNotMatch(input, /text-base|sm:text-xs/, 'do not regress to rem-based mobile input sizes');
  assert.match(input, /focus:border-purple-500\/60/);
  assert.match(input, /touch-manipulation/);
});

test('the archive fits narrow phones even after opening search', () => {
  assert.match(archive, /max-w-\[calc\(100dvw-16px\)\]/);
  assert.match(archive, /overflow-x-hidden overflow-y-auto/);
  assert.match(archive, /relative w-full min-w-0 flex-1 sm:min-w-\[200px\]/);
  assert.match(archive, /flex w-full min-w-0 flex-wrap items-center gap-2 text-xs sm:w-auto/);
  assert.match(archive, /min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain/);
  assert.match(archive, /max-h-\[92dvh\]/);
  assert.match(archive, /\{t\('archive\.title'\)\}/);
  assert.match(index, /width=device-width, initial-scale=1\.0/);
  assert.doesNotMatch(index, /user-scalable=no|maximum-scale=1/);
});
