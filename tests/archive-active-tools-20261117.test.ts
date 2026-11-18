import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ArchivedChartSnapshot, ArchivedFormation } from '../src/types';
import { archiveWithoutVisualImage, buildArchivedChartSnapshot } from '../src/utils/archiveChartSnapshot';
import { archiveVisibleOverlayKeys, sanitizeArchivedOverlayScene } from '../src/utils/archivedOverlayScene';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const snapshot = (overrides: Partial<ArchivedChartSnapshot> = {}): ArchivedChartSnapshot => ({
  version: 1, capturedAt: 1_700_000_000_000, marketKey: 'binance:futures:BTCUSDT:1h', timeframe: '1h',
  drawings: [], overlays: [],
  scalperEnabled: false, scalperRegression: false, scalperLabels: false, scalperLines: [],
  liquidationMap: {enabled:false,period:'24h'}, tradeLevels: {entry:false,target:false,stop:false},
  ...overrides,
});

test('all completed left-hand drawing tools are saved; never save alert or cursor', () => {
  const names = ['level', 'trend', 'ray', 'rect', 'fib', 'profile', 'text', 'ruler'];
  const drawings = names.map((type, n) => ({
    id: 'BTCUSDT:' + type,
    type,
    pts: n === 0 || type === 'text' ? [{t:1_700_000_000_000,p:100+n}] :
      [{t:1_700_000_000_000,p:100+n},{t:1_700_003_600_000,p:101+n}],
    ...(type === 'text' ? { text: 'My note' } : {}),
  }));
  drawings.push({id:'BTCUSDT:alert',type:'alert',pts:[{t:1_700_000_000_000,p:123}]});
  const saved = buildArchivedChartSnapshot(snapshot({drawings}));
  assert.deepEqual(saved.drawings.map(x => x.type), names);
  assert.equal(saved.drawings.find(x => x.type === 'text')?.text, 'My note');
  assert.ok(saved.drawings.every(x => x.type !== 'alert'));
});

test('automatic overlays save only if there was actual visible geometry', () => {
  const enabled = ['sr','prevDay','dayOpen','vwap','localHL','roundLevels','poc','channel','stops'] as const;
  const scene = {
    sr:[{kind:'R' as const,t:1_700_000_000_000,p:150}],
    vwap:[{t:1_700_000_000_000,p:143},{t:1_700_000_060_000,p:145}],
    roundLevels:[140,150,160],
    poc:{pLo:140,pMid:145,pHi:150},
  };
  const saved = buildArchivedChartSnapshot(snapshot({overlays:[...enabled],overlayScene:scene}));
  assert.deepEqual(saved.overlays,['sr','vwap','roundLevels','poc']);
  assert.deepEqual(archiveVisibleOverlayKeys(saved.overlayScene),saved.overlays);
  assert.equal(saved.overlayScene?.sr?.[0].p,150);
  assert.equal(saved.overlayScene?.vwap?.length,2);
  assert.deepEqual(buildArchivedChartSnapshot(snapshot({overlays:[...enabled],overlayScene:{}})).overlays,[]);
  assert.deepEqual(buildArchivedChartSnapshot(snapshot({overlays:[],overlayScene:scene})).overlays,[],
    'an overlay cannot reappear merely because a scene record contains geometry');
});

test('all nine upper overlays can preserve exact historical geometry when enabled and visible', () => {
  const t = 1_700_000_000_000;
  const enabled = ['sr','prevDay','dayOpen','vwap','localHL','roundLevels','poc','channel','stops'] as const;
  const saved = buildArchivedChartSnapshot(snapshot({
    overlays:[...enabled],
    overlayScene:{
      sr:[{kind:'S',p:120,t}],
      prevDay:{h:160,l:100,t},
      dayOpen:{p:140,t},
      vwap:[{p:141,t},{p:142,t:t+60_000}],
      localHL:[{kind:'R',p:150,t}],
      roundLevels:[100,125,150],
      poc:{pLo:130,pMid:135,pHi:140},
      channel:{t0:t,t1:t+600_000,up0:160,up1:165,dn0:130,dn1:135,c0:145,c1:150},
      stops:[{side:'SHORT',p:161,t}],
    },
  }));
  assert.deepEqual(saved.overlays,[...enabled]);
  assert.deepEqual(archiveVisibleOverlayKeys(saved.overlayScene),[...enabled]);
});

test('visible formation support/resistance survives without inventing automatic pivots', () => {
  const saved = buildArchivedChartSnapshot(snapshot({
    overlays:[], overlayScene:{}, srMarkersVisible:true,
  }));
  assert.deepEqual(saved.overlays,[]);
  assert.equal(saved.srMarkersVisible,true);
  const chart=read('../src/components/TradingViewChart.tsx');
  assert.match(chart,/chartSnapshot\?\.srMarkersVisible/);
  const canvas=read('../src/components/hookchart/HookChartCanvas.tsx');
  assert.match(canvas,/takeArchiveVisibleSrMarkers\?\.\(\)/);
  const engine=read('../src/components/hookchart/engine.tsx');
  assert.match(engine,/archiveSrMarkerRef\.current=\(\)=>\{/);
});

test('invalid or missing automatic observations cannot reappear as enabled tools', () => {
  const bad = sanitizeArchivedOverlayScene({
    vwap:[{p:0,t:1}],
    sr:[{kind:'S',p:0,t:1}],
    poc:{pHi:2,pMid:4,pLo:1},
    stops:[{side:'LONG',p:-1,t:1}],
  });
  assert.deepEqual(bad,{});
  const saved = buildArchivedChartSnapshot(snapshot({overlays:['sr','stops','poc'],overlayScene:bad}));
  assert.deepEqual(saved.overlays,[]);
  assert.equal(saved.overlayScene,undefined);
});

test('legacy archive data stays compatible; archive list omits large exact geometry', () => {
  const older = buildArchivedChartSnapshot(snapshot({overlays:['sr','roundLevels']}));
  assert.deepEqual(older.overlays,['sr','roundLevels']);
  assert.equal(older.overlayScene,undefined);
  const full = buildArchivedChartSnapshot(snapshot({overlays:['dayOpen'],overlayScene:{dayOpen:{p:150,t:1_700_000_000_000}}}));
  const lite = archiveWithoutVisualImage({id:'abc',chartSnapshot:full} as ArchivedFormation);
  assert.equal(lite.chartSnapshot?.overlayScene,undefined);
  assert.ok(full.overlayScene?.dayOpen);
});

test('live HookChart captures only on the explicit save path; archive replays frozen coordinates', () => {
  const engine = read('../src/components/hookchart/engine.tsx');
  const canvas = read('../src/components/hookchart/HookChartCanvas.tsx');
  const server = read('../server/pgIdentity.ts');
  assert.match(engine,/archiveOverlayRef\.current=\(\)=>\{/);
  assert.match(engine,/archivedOverlayScene\.poc/);
  assert.match(canvas,/takeArchiveOverlayScene\?\.\(\)/);
  assert.match(canvas,/archiveOriginalScope/);
  assert.match(canvas,/archiveMode \? archivedDensities : replay \? \[\] : chartDensities/);
  assert.match(canvas,/showDensityLines=\{archiveMode \?/);
  assert.match(canvas, /!archiveMode && drawingToolbarOpen && panel === 'indicators'/);
  assert.match(canvas, /if \(use\('signalLevel'\) && !archiveMode\)/);
  assert.match(server,/\(payload->'chartSnapshot'\) - 'drawings' - 'scalperLines' - 'density' - 'overlayScene'/);
});
