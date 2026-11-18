import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/replay/ReplayJournal.tsx', import.meta.url), 'utf8');

test('journal screenshots open outside clipped journal using body portal', () => {
  assert.match(source, /selectedScreenshot && typeof document !== 'undefined' && createPortal\(/);
  assert.match(source, /document\.body/);
  assert.match(source, /data-replay-screenshot-overlay/);
  assert.match(source, /role="dialog" aria-modal="true"/);
  assert.match(source, /h-\[96dvh\].*w-\[98vw\].*max-w-\[1900px\]/);
  assert.doesNotMatch(source, /max-w-4xl max-h-\[90vh\]/);
});

test('journal screenshot fits large viewport and toggles original PNG pixels without new chart or network', () => {
  assert.match(source, /data-replay-screenshot-viewport/);
  assert.match(source, /setScreenshotZoomed\(value => !value\)/);
  assert.match(source, /max-w-none shrink-0/);
  assert.match(source, /max-h-full max-w-full shrink-0/);
  assert.match(source, /setScreenshotZoomed\(false\)/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /download=\{\`trade_/);
  assert.doesNotMatch(source, /\b(fetch|WebSocket|setInterval|new HookChart)\s*\(/);
});

test('screenshot zoom labels are translated for uk, en, pl and ru', () => {
  for (const lang of ['uk','en','pl','ru']) {
    assert.match(source, new RegExp('  ' + lang + ': \\{ zoom: .+ fit: .+ \\}'));
  }
  assert.match(source, /previewLabel\.fit : previewLabel\.zoom/);
});
