import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('initial loading page uses the new legged h00k robot logo', () => {
  const app = read('../src/App.tsx');
  const loading = read('../public/h00k-loading-robot.svg');
  const existing = read('../public/h00k-robot-logo.svg');

  assert.match(app, /src="\/h00k-loading-robot\.svg"/);
  assert.doesNotMatch(app, /src="\/h00k-loading-logo\.svg"/);
  assert.match(loading, /viewBox="0 0 100 70"/);
  assert.match(loading, /Loading-screen-only robot legs/);
  assert.match(loading, /robot-eye-blink 6\.8s/);
  assert.match(loading, /robot-eye-look 5\.6s/);
  assert.match(loading, /prefers-reduced-motion: reduce/);
  assert.equal((loading.match(/class="robot-eye"/g) ?? []).length, 2);

  // Keep the original h/k wordmark paths identical to the production logo.
  const letters = [...existing.matchAll(/<path d="([^"]+)"\s*\/>/g)].slice(0, 2);
  assert.equal(letters.length, 2);
  for (const [, path] of letters) assert.ok(loading.includes(path));
});
