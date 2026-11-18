import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) =>
  readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const header = read('src/components/Header.tsx');
const formation = read('src/components/FormationCard.tsx');
const fullscreen = read('src/components/FullscreenChartModal.tsx');
const headerClass = header.match(/<header className="([^"]+)" data-page=\{activePage\}>/)?.[1] || '';
const navClass = header.match(/<nav aria-label=\{tr\("Основна навігація"\)\} className="([^"]+)"/)?.[1] || '';

test('mobile site header covers underlying quick-chart controls without translucency', () => {
  assert.match(headerClass, /\bsticky\s+top-0\s+z-40\b/);
  assert.match(headerClass, /\bbg-slate-950\b/);
  assert.doesNotMatch(headerClass, /bg-slate-950\/|backdrop-blur/);
  assert.match(navClass, /\bbg-slate-900\b/);
  assert.doesNotMatch(navClass, /bg-slate-900\//);
  assert.match(navClass, /grid-cols-2/);
  assert.match(formation, /formation-chart-header relative z-30/);
});

test('raised header stays behind full-screen chart dialog and preserves existing navigation', () => {
  assert.match(fullscreen, /fixed inset-0 z-\[100\]/);
  for (const page of ['screener', 'patterns', 'terminal', 'replay']) {
    assert.ok(header.includes(`onPageChange('${page}')`));
  }
  assert.match(header, /<SiteNotificationBell/);
});
