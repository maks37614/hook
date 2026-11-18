import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../src/styles/dialogQuality.css');
const main = read('../src/main.tsx');
const annotated = [
  'AuthModal.tsx',
  'UserProfileModal.tsx',
  'WatchlistDrawer.tsx',
  'ArchiveModal.tsx',
  'TelegramAlertsModal.tsx',
];

test('dialog polish stays in the preexisting CSS bundle', () => {
  assert.match(main, /import '\.\/styles\/dialogQuality\.css';/);
});

test('dialog polish only targets explicit panel classes', () => {
  for (const file of annotated) {
    const source = read('../src/components/' + file);
    assert.ok(source.includes('className="vq-modal-shell ') || source.includes('className={`vq-modal-shell '));
    assert.match(source, /className="vq-modal-header /);
  }
  assert.match(read('../src/components/AuthModal.tsx'), /className="vq-modal-controls space-y-3"/);
  assert.match(read('../src/components/UserProfileModal.tsx'), /className="vq-modal-controls flex flex-wrap/);
  assert.match(read('../src/components/WatchlistDrawer.tsx'), /className="vq-modal-controls min-w-0 shrink-0/);
});

test('dialog polish is dark-theme-only and paint-only, never chart/market rendering', () => {
  const raw = css.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const rules = [...raw.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  assert.equal(rules.length, 15);
  assert.equal(raw.replace(/([^{}]+)\{([^{}]*)\}/g, '').trim(), '');
  for (const [, selectorText, body] of rules) {
    const selector = selectorText.trim();
    assert.match(selector, /^:is\(html\[data-site-surface="classic"\]/);
    assert.match(selector, /html\[data-site-surface="plum"\]\) \.vq-modal-(?:shell|header|controls)/);
    assert.doesNotMatch(selector, /canvas|hookchart|chartWrap|chart-root|replay/i);
    for (const declaration of body.split(';').map(s => s.trim()).filter(Boolean)) {
      assert.match(
        declaration,
        /^(?:color|caret-color|border-color|border-bottom-color|outline|outline-offset):\s*(?:var\(--color-(?:slate|cyan)-\d+\)|[12]px solid var\(--color-cyan-400\)|-?[12]px)$/,
      );
    }
  }
  assert.doesNotMatch(raw, /(?:^|[;{}\s])(?:filter|backdrop-filter|animation|transition|transform|box-shadow|width|height|padding|margin|font-size|opacity|will-change)\s*:/i);
});
