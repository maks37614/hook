import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('fullscreen multichart CSS loads in Vite entry, never in Node-imported chart component', () => {
  const component = read('../src/components/fullscreen/FullscreenMultiChart.tsx');
  const entry = read('../src/main.tsx');
  assert.doesNotMatch(component, /import\s+['"]\.\/fullscreenMultiChart\.css['"]/);
  assert.match(entry, /import\s+['"]\.\/components\/fullscreen\/fullscreenMultiChart\.css['"]/);
});
