import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the app shell uses the selected surface without changing routed charts', () => {
  const app = read('../src/App.tsx');
  assert.ok(
    app.includes("chartPageActive ? 'bg-[#070a12]' : 'bg-[var(--site-body-background,#070a12)]'"),
    'regular pages must use the configured theme; chart routes retain the original backdrop',
  );
  assert.ok(
    app.includes('className="min-h-screen bg-[#070a12] flex flex-col items-center justify-center p-4 text-slate-300"'),
    'keep the loading view unchanged',
  );
});

test('all surface themes retain an explicit CSS background variable', () => {
  const css = read('../src/index.css') + '\n' + read('../src/styles/visualQuality.css');
  const surfaces = ['classic', 'midnight', 'graphite', 'plum', 'mist', 'sand', 'lavender', 'mint'];
  for (const surface of surfaces) {
    const block = css.match(new RegExp('html\\[data-site-surface="' + surface + '"\\]\\s*\\{([^}]*)\\}', 'g')) ?? [];
    assert.ok(block.some(text => /--site-body-background:\s*#[0-9a-f]{6}/i.test(text)),
      surface + ' must expose a body background token');
  }
});
