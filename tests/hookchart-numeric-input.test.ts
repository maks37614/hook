import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settings = readFileSync(new URL('../src/components/hookchart/OriginalHookChartSettings.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/hookchart/integration.css', import.meta.url), 'utf8');

test('HookChart numeric fields allow an empty draft before committing', () => {
  const num = settings.slice(settings.indexOf('function Num('), settings.indexOf('function Choice('));
  assert.match(num, /useState<string \| null>\(null\)/);
  assert.match(num, /value=\{draft \?\? value\}/);
  assert.match(num, /onChange=\{event => setDraft\(event.currentTarget.value\)\}/);
  assert.match(num, /if \(!raw.trim\(\)\) return/);
  assert.match(num, /onBlur=\{event => commit\(event.currentTarget.value\)\}/);
  assert.doesNotMatch(num, /Number\(event.target.value\)/);
});

test('HookChart numeric entries clamp after editing and support Enter', () => {
  const num = settings.slice(settings.indexOf('function Num('), settings.indexOf('function Choice('));
  assert.match(num, /if \(min !== undefined\) next = Math.max\(min, next\)/);
  assert.match(num, /if \(max !== undefined\) next = Math.min\(max, next\)/);
  assert.match(num, /if \(event.key === 'Enter'\) event.currentTarget.blur\(\)/);
  assert.match(num, /event.currentTarget.select\(\)/);
});

test('mobile numeric inputs are large enough to avoid iOS Safari focus zoom', () => {
  assert.match(css, /@media \(max-width:767px\)/);
  assert.match(css, /\.originalSettingsPanel \.numInput/);
  assert.match(css, /font-size:16px !important/);
});

test('only the Graph tab presents the right margin setting', () => {
  assert.equal((settings.match(/<Setting label="Відступ праворуч"/g) || []).length, 1);
  assert.doesNotMatch(settings, /<SwitchRow label="Відступ праворуч"/);
  assert.doesNotMatch(settings, /prefs\.rightPaddingEnabled !== false/);
  assert.match(settings, /Вільний простір праворуч від останньої свічки \(у барах\)/);
});
