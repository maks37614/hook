import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('only the Screener grid-card opts into the hidden top bar and footer timeframes', () => {
  const mini = source('../src/components/ScreenerCardChart.tsx');
  const screener = source('../src/components/CoinScreenerPage.tsx');
  const formations = source('../src/components/FormationCard.tsx');
  const wrapper = source('../src/components/TradingViewChart.tsx');
  const hookchart = source('../src/components/hookchart/HookChartCanvas.tsx');

  assert.match(mini, /compactScreenerCard\s*\n\s*forceHookChart/);
  assert.match(screener, /LazyScreenerCardChart/);
  assert.doesNotMatch(formations, /compactScreenerCard/);
  assert.match(wrapper, /compactScreenerCard=\{compactScreenerCard\}/);
  assert.match(hookchart, /compactScreenerCard && visualContext === 'screenerQuick'/);
  assert.match(hookchart, /!terminalMode && !replay && !archiveMode/);
});

test('Screener card footer has responsive real timeframe actions instead of Max and Min', () => {
  const hookchart = source('../src/components/hookchart/HookChartCanvas.tsx');
  const css = source('../src/components/hookchart/hookchart.css');

  assert.match(hookchart, /showMarketStats \|\| screenerCardCompactLayout/);
  assert.match(hookchart, /screenerCardCompactLayout \? \(\s*<div className="screenerCardTimeframes"/);
  assert.match(hookchart, /TIMEFRAMES\.map\(tf =>/);
  assert.match(hookchart, /onClick=\{\(\) => selectTimeframe\(tf\)\}/);
  assert.match(hookchart, /\) : showMarketStats \? \(\s*<>\s*<span>Max:/);
  assert.match(hookchart, /<span>Min:/);
  assert.match(css, /\.hookchart-root\.hookchart-screener-card-compact > \.hookchart-toolbar \{\s*display:none!important/);
  assert.match(css, /\.hookchart-root\.hookchart-screener-card-compact \.screenerCardTimeframes button\.active/);
});
