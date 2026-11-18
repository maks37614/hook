import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('read-only replay review hides controls only in its scoped instance', () => {
  const canvas = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/components/hookchart/hookchart.css', import.meta.url), 'utf8');
  assert.match(canvas, /replayReview\?: boolean/);
  assert.match(canvas, /replayReview = false/);
  assert.match(canvas, /replayReview \? ' hookchart-replay-review'/);
  assert.match(css, /\.hookchart-root\.hookchart-replay-review \.hookchart-toolbar/);
  assert.match(css, /\.hookchart-toolbar > :not\(\.hookchart-timeframes\)/);
  assert.doesNotMatch(css, /^\s*\.hookchart-toolbar > :not\(\.hookchart-timeframes\)/m);
});
