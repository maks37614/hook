import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/components/hookchart/integration.css', import.meta.url), 'utf8');

test('iOS chart surfaces do not offer Safari native text-selection and Copy menu', () => {
  const section = css.match(/\/\* iOS Safari can open[\s\S]*?(?=\.hookchart-root \.chartStage\[data-drawing-tools=)/)?.[0];
  assert.ok(section, 'chart-specific Safari callout rules must be present');
  for (const surface of ['.hookchart-toolbar', '.chartWrap', '.chartTimeAxis', '.indicatorDock'])
    assert.ok(section.includes(surface), `missing non-selectable chart surface: ${surface}`);
  assert.match(section, /-webkit-touch-callout:\s*none/);
  assert.match(section, /-webkit-user-select:\s*none/);
  assert.match(section, /user-select:\s*none/);
  assert.doesNotMatch(section, /(?:preventDefault|touch-action:)/, 'do not interfere with pan, pinch and hold-to-inspect gestures');
});

test('calendar and other editable chart controls retain native iOS selection and paste', () => {
  const editable = css.match(/\/\* Text and date\/time fields inside the chart[\s\S]*?\n}/)?.[0];
  assert.ok(editable);
  assert.match(editable, /input, textarea, \[contenteditable="true"\]/);
  assert.match(editable, /-webkit-touch-callout:\s*default/);
  assert.match(editable, /-webkit-user-select:\s*text/);
  assert.match(editable, /user-select:\s*text/);
});
