import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/Header.tsx', import.meta.url), 'utf8');
const shortcuts = source.slice(source.indexOf('<SiteNotificationBell'));

test('header shortcuts follow the requested visual and keyboard focus order', () => {
  const controls = [
    '<SiteNotificationBell',
    'id="open-metascalp-btn"',
    'id="open-watchlist-btn"',
    'id="open-telegram-btn"',
    'id="open-surveillance-btn"',
    'id="open-archive-btn"',
    'id="open-guide-btn"',
    'id="user-profile-btn"',
  ];
  const positions = controls.map((control) => shortcuts.indexOf(control));
  for (let index = 0; index < positions.length; index += 1) {
    assert.ok(positions[index] >= 0, `Missing header control: ${controls[index]}`);
    if (index > 0) {
      assert.ok(positions[index - 1] < positions[index], `Wrong header shortcut order: ${controls[index]}`);
    }
  }
});

test('reordered shortcuts keep their original handlers', () => {
  assert.match(shortcuts, /id="open-metascalp-btn"[\s\S]*?onClick=\{onOpenMetaScalp\}/);
  assert.match(shortcuts, /id="open-watchlist-btn"[\s\S]*?onClick=\{onOpenWatchlist\}/);
  assert.match(shortcuts, /id="open-telegram-btn"[\s\S]*?onClick=\{onOpenTelegramAlerts\}/);
  assert.match(shortcuts, /id="open-surveillance-btn"[\s\S]*?onClick=\{\(\) => onPageChange\('surveillance'\)\}/);
  assert.match(shortcuts, /id="open-archive-btn"[\s\S]*?onClick=\{onOpenArchive\}/);
  assert.match(shortcuts, /id="open-guide-btn"[\s\S]*?onClick=\{onOpenGuide\}/);
});
