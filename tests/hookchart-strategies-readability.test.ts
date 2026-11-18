import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('strategy futures note no longer mentions OKX in any language', () => {
  const source = read('../src/components/hookchart/strategyEngine.ts');
  const match = source.match(/const FUTURES='([^']+)'/);
  assert.ok(match, 'futures note is defined');
  const note = match[1];
  assert.doesNotMatch(note, /OKX/i);
  assert.match(note, /Binance и Bybit/);
  assert.match(note, /spot/);

  for (const language of ['uk', 'en', 'ru', 'pl']) {
    const pack = JSON.parse(read(`../src/locales/hookchart/${language}.json`)) as Record<string, string>;
    assert.ok(pack[note], `${language} translation exists for the updated note`);
    assert.doesNotMatch(pack[note], /OKX/i, `${language} futures disclaimer omits OKX`);
    assert.match(pack[note], /Binance/);
    assert.match(pack[note], /Bybit/);
  }
});

test('HookChart strategy cards use high contrast and mobile readable text', () => {
  const css = read('../src/components/hookchart/integration.css');
  const settings = read('../src/components/hookchart/OriginalHookChartSettings.tsx');
  assert.match(settings, /className=\{'strategyCard ' \+/,
    'strategy cards keep their base class when an active class is appended');
  assert.match(settings, /className="strategyNote"/);
  assert.match(css, /Strategy cards: legible descriptions/);
  assert.match(css, /\.strategySettings \.strategyCard p\s*\{[^}]*color:#d1dce8;[^}]*font-size:13px;/);
  assert.match(css, /\.strategySettings \.strategyCard ul\s*\{[^}]*color:#c0cfde;[^}]*font-size:12px;/);
  assert.match(css, /\.strategySettings \.strategyNote\s*\{[^}]*color:#f7ce8a;[^}]*font-size:12px;/);
  assert.match(css, /@container \(max-width:620px\)\s*\{[\s\S]*\.strategySettings \.strategyCard p,/);
});
