import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles/visualQuality.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

test('visual quality stylesheet is imported by the application', () => {
  assert.match(main, /import '\.\/styles\/visualQuality\.css';/);
});

test('visual quality changes are static, theme-scoped colors only', () => {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const rules = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  assert.equal(rules.length, 5);
  assert.equal(source.replace(/([^{}]+)\{([^{}]*)\}/g, '').trim(), '');

  const scopes = new Set<string>();
  for (const [, selectorText, body] of rules) {
    const selector = selectorText.trim();
    assert.match(selector, /^html\[data-site-(?:surface|accent)="(?:classic|midnight|graphite|plum|cyan)"\]$/);
    scopes.add(selector);
    const declarations = body.split(';').map(s => s.trim()).filter(Boolean);
    assert.ok(declarations.length > 0);
    for (const declaration of declarations) {
      assert.match(
        declaration,
        /^--(?:site-body-background|color-(?:slate|cyan)-(?:50|100|200|300|400|500|600|700|800|900|950)):\s*#[0-9a-f]{6}$/i,
      );
    }
  }
  assert.equal(scopes.size, rules.length);
  assert.ok(scopes.has('html[data-site-surface="classic"]'));
  assert.ok(scopes.has('html[data-site-accent="cyan"]'));
});
