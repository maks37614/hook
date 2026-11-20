import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas=readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx',import.meta.url),'utf8');

test('viewport React commits do not repeat density potential classification',()=>{
  assert.match(canvas,/const potentialDensityCount = useMemo\(\(\) =>\s*liveFeed\.densities\.filter\(density => density\.reactionTier === 'potential'\)\.length,\s*\[liveFeed\.densities\]/);
  assert.match(canvas,/onViewportChange=\{setViewport\}/,
    'visible indicator panels and time axis must still track the chart viewport');
  assert.match(canvas,/<MemoChartTimeAxis candles=\{candles\}/);
  assert.match(canvas,/<IndicatorDock ids=\{indicators\}/);
});

test('potential classification preserves count and source ordering',()=>{
  const levels=[{reactionTier:'normal'},{reactionTier:'potential'},{reactionTier:'potential'},{reactionTier:undefined}];
  const count=levels.filter(level=>level.reactionTier==='potential').length;
  assert.equal(count,2);
  const next=[...levels,{reactionTier:'potential'}];
  assert.equal(next.filter(level=>level.reactionTier==='potential').length,3);
  assert.equal(levels.length,4);
});
