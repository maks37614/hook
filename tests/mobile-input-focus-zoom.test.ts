import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const css = read('src/styles/mobileInputFocus.css');
const main = read('src/main.tsx');
const html = read('index.html');

test('touch input styles load after other CSS and reach fields outside the root portal', () => {
  const imports = [...main.matchAll(/import ['"]([^'"]+\.css)['"];/g)].map(m => m[1]);
  assert.equal(imports.at(-1), './styles/mobileInputFocus.css');
  assert.match(css, /@media \(hover: none\) and \(pointer: coarse\)/);
  assert.match(css, /html :is\(/);
  assert.match(css, /\btextarea,/);
  assert.match(css, /\bselect,/);
  assert.match(css, /\[contenteditable="true"\]/);
  assert.match(css, /\[contenteditable="plaintext-only"\]/);
});

test('editable fields have a minimum 16 CSS px without affecting non-text controls', () => {
  assert.match(css, /font-size:\s*max\(16px, 1rem\) !important;/);
  for (const type of ['checkbox', 'radio', 'range', 'color', 'file', 'hidden',
    'button', 'submit', 'reset', 'image']) {
    assert.ok(css.includes(':not([type="' + type + '"])'), type);
  }
  assert.doesNotMatch(css, /(?:width|height|padding|transform|line-height|zoom)\s*:/);
  assert.doesNotMatch(css, /@keyframes|setInterval|addEventListener/);
});

test('fix does not block user pinch zoom or change desktop viewport rules', () => {
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0"/);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i);
  assert.doesNotMatch(css, /user-scalable|maximum-scale|touch-action:\s*none/);
});
