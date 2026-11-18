import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interpolate, locales, translateKey } from '../src/locales';
import { replayChartUiRows } from '../src/locales/replayChartUi20261115';

const languages = ['uk', 'en', 'ru', 'pl'] as const;
const placeholders = (text: string) => [...text.matchAll(/\{\{([^}]+)\}\}/g)].map(match => match[1]).sort();
test('Replay chart and keyboard controls have all four matching language templates', () => {
  const seen = new Set<string>();
  for (const row of replayChartUiRows) {
    assert.equal(row.length, 5);
    assert.ok(!seen.has(row[0]));
    seen.add(row[0]);
    const vars = Object.fromEntries(placeholders(row[1]).map(name => [name, '42']));
    for (const [index, language] of languages.entries()) {
      const key = 'replay.chart.' + row[0];
      assert.deepEqual(placeholders(row[index + 1]), placeholders(row[1]));
      assert.equal(locales[language].strings[key], row[index + 1]);
      assert.equal(translateKey(language, key, vars), interpolate(row[index + 1], vars));
    }
  }
});

test('Replay header, speed picker and fullscreen actions display localized labels', () => {
  const src = (path: string) => readFileSync(new URL('../src/components/' + path, import.meta.url), 'utf8');
  assert.ok(src('ReplayPage.tsx').includes('replay.chart.page.intro'));
  assert.ok(src('replay/ReplaySpeedPicker.tsx').includes('replay.chart.speed.choose'));
  assert.ok(src('replay/ReplayChart.tsx').includes('replay.chart.chart.entryLine'));
  assert.ok(src('replay/ReplayFullscreenActions.tsx').includes('replay.chart.actions.group'));
  assert.equal(translateKey('en', 'replay.chart.chart.entryLine', { side:'LONG', price:'0.52' }), 'Entry LONG: 0.52');
});
