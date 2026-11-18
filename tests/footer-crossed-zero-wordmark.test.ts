import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('shared footer uses the h00k.top crossed-zero SVG instead of the robot eyes', () => {
  const footer = read('src/components/SiteFooter.tsx');
  assert.match(footer, /<img src="\/h00k-logo\.svg" alt="h00k\.top" width=\{194\} height=\{48\}/);
  assert.match(footer, /className="block h-10 w-auto sm:h-12"/);
  assert.doesNotMatch(footer, /h00k-robot-logo\.svg/);
  assert.match(footer, /aria-label="h00k\.top"/);
  assert.match(footer, /getLegalCopy\(language\)/);
});

test('h00k.top footer logo keeps original cyan/white palette and both crossed zeros', () => {
  const logo = read('public/h00k-logo.svg');
  assert.match(logo, /<title id="logo-title">h00k\.top<\/title>/);
  assert.match(logo, /fill="#22d3ee"/);
  assert.match(logo, /fill="#ffffff"/);
  assert.match(logo, /<path d="M 31\.123 29\.7 L 41\.123 13\.1"/);
  assert.match(logo, /<path d="M 55\.205 29\.7 L 65\.205 13\.1"/);
});

test('single shared footer still mounts in the main site and Terminal', () => {
  const app = read('src/App.tsx');
  const terminal = read('src/components/TerminalPage.tsx');
  assert.match(app, /<SiteFooter \/>/);
  assert.match(terminal, /<SiteFooter \/>/);
});
