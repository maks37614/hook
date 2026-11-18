import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../src/styles/interfacePolish.css');
const main = read('../src/main.tsx');

test('interface polish loads from the existing production bundle', () => {
  assert.match(main, /import '\.\/styles\/interfacePolish\.css';/);
});

test('interface polish touches only known UI containers', () => {
  assert.match(read('../src/components/ScreenerFilters.tsx'), /className="vq-filter-panel /);
  assert.match(read('../src/components/CoinScreenerPage.tsx'), /className="vq-filter-panel /);
  assert.match(read('../src/components/ScreenerTable.tsx'), /className="vq-data-panel /);
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  assert.ok(rules.length >= 10);
  assert.equal(withoutComments.replace(/([^{}]+)\{([^{}]*)\}/g, '').trim(), '');
  for (const [, selector, declarations] of rules) {
    assert.match(selector.trim(), /^:is\(html\[data-site-surface="classic"\]/);
    assert.match(selector, /html\[data-site-surface="plum"\]\)/);
    assert.doesNotMatch(selector, /canvas|hookchart-root|chartWrap|price-scale/i);
    for (const declaration of declarations.split(';').map(value => value.trim()).filter(Boolean)) {
      assert.match(declaration, /^(?:border-color|border-bottom-color|border-top-color|background-color|color|outline|outline-offset):\s*(?:var\(--color-(?:slate|cyan)-\d+\)|\d+px solid (?:rgba\([\d., ]+\)|var\(--color-cyan-400\))|-?\d+px)$/);
    }
  }
  assert.doesNotMatch(withoutComments, /(?:^|[;{}\s])(?:filter|backdrop-filter|animation|transition|transform|box-shadow|width|height|padding|margin|font-size|opacity)\s*:/i);
});
