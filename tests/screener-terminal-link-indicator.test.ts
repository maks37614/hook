import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const header = readFileSync(new URL('../src/components/Header.tsx', import.meta.url), 'utf8');
const linkingButton = header.slice(header.indexOf('id="open-metascalp-btn"'), header.indexOf('id="open-watchlist-btn"'));

test('Screener linking shortcut uses lightning and a quiet dot instead of OFF or binding text', () => {
  assert.match(linkingButton, /<Zap className=/);
  assert.match(linkingButton, /data-link-status=\{isLinkingEnabled \? 'on' : 'off'\}/);
  assert.match(linkingButton, /bg-emerald-400\/70/);
  assert.match(linkingButton, /bg-slate-600\/70/);
  assert.match(linkingButton, /h-1\.5 w-1\.5 shrink-0 rounded-full/);
  assert.doesNotMatch(linkingButton, /\{linkingBadge\}|\bOFF\b|ВИМК/);
  assert.doesNotMatch(header, /const linkingBadge/);
});

test('status remains accessible and navigation and guest lock stay intact', () => {
  assert.match(linkingButton, /onClick=\{onOpenMetaScalp\}/);
  assert.match(linkingButton, /aria-label=/);
  assert.match(linkingButton, /aria-hidden="true"/);
  assert.match(linkingButton, /<Lock className=/);
  assert.match(header, /const linkingStatus = isLinkingEnabled \? t\('header\.linking\.enabled'\) : t\('header\.linking\.disabled'\)/);
  assert.match(linkingButton, /t\('header\.linking\.aria', \{ terminal: terminalName, status: linkingStatus \}\)/);
});
