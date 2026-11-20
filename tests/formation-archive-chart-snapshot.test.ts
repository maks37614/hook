import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ArchivedChartSnapshot, ArchivedFormation, ChartMarkerInfo } from '../src/types';
import {
  ARCHIVE_IMAGE_LIMIT, buildArchivedChartSnapshot, archiveWithoutVisualImage,
  archiveVisualMarketKey, visibleArchivedMarkers, visibleArchivedDensityScene,
} from '../src/utils/archiveChartSnapshot';

const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
const key=archiveVisualMarketKey('bybit','futures','NVDA/USDT','1h');
const base=(overrides:Partial<ArchivedChartSnapshot>={}):ArchivedChartSnapshot=>({
  version:1,capturedAt:100,marketKey:key,timeframe:'1h',
  drawings:[
    {id:'NVDAUSDT:level-a',type:'level',pts:[{t:1_000,p:180}]},
    {id:'NVDAUSDT:trend-a',type:'trend',pts:[{t:1_000,p:176},{t:2_000,p:182}]},
    {id:'NVDAUSDT:fib-a',type:'fib',pts:[{t:1_000,p:170},{t:2_000,p:184}]},
    {id:'NVDAUSDT:rect-a',type:'rect',pts:[{t:1_000,p:165},{t:2_000,p:173}]},
    {id:'NVDAUSDT:ruler-a',type:'ruler',pts:[{t:1_000,p:171},{t:2_000,p:176}]},
    {id:'NVDAUSDT:text-a',type:'text',text:'A note',pts:[{t:1_000,p:177}]},
    {id:'NVDAUSDT:profile-a',type:'profile',pts:[{t:1_000,p:165},{t:2_000,p:180}]},
    {id:'NVDAUSDT:alert-1',type:'alert',pts:[{t:2_000,p:189}]},
  ],
  overlays:['sr','prevDay','dayOpen','vwap','localHL','roundLevels','poc','channel','stops'],
  scalperEnabled:true,scalperRegression:false,scalperLabels:true,
  scalperLines:[{role:'upper',from:{t:1_000,p:180},to:{t:2_000,p:185}}],
  liquidationMap:{enabled:true,period:'7d'},tradeLevels:{entry:false,target:true,stop:false},
  ...overrides,
});
const markers:ChartMarkerInfo[]=[
  {id:'entry',type:'entry',price:100,color:'#55f',label:'Entry'},
  {id:'tp',type:'target',price:112,color:'#0f0',label:'TP'},
  {id:'sl',type:'stop_loss',price:95,color:'#f00',label:'SL'},
  {id:'neck',type:'neckline',price:104,color:'#ff0',label:'Neck'},
];

test('archive captures each manual drawing, all nine enabled overlays, frozen scalper and Liq map, never alerts',()=>{
  const snapshot=buildArchivedChartSnapshot(base());
  assert.deepEqual(snapshot.drawings.map(d=>d.type),['level','trend','fib','rect','ruler','text','profile']);
  assert.equal(snapshot.drawings.find(d=>d.type==='text')?.text,'A note');
  assert.equal(snapshot.overlays.length,9);
  assert.equal(snapshot.scalperLines.length,1);
  assert.deepEqual(snapshot.liquidationMap,{enabled:true,period:'7d'});
  assert.deepEqual(snapshot.tradeLevels,{entry:false,target:true,stop:false});
  assert.equal(snapshot.marketKey,'bybit:futures:NVDAUSDT:1h');
  assert.ok(!('alerts' in snapshot));
  assert.ok(!('indicators' in snapshot));
});

test('a large drawing collection preserves every valid annotation without truncating the oldest',()=>{
  const drawings=Array.from({length:160},(_,i)=>({
    id:'NVDAUSDT:level-'+i,type:'level',pts:[{t:1_000+i,p:110+i}],
  }));
  const capture=buildArchivedChartSnapshot(base({drawings}));
  assert.equal(capture.drawings.length,160);
  assert.equal(capture.drawings[0].id,'NVDAUSDT:level-0');
  assert.equal(capture.drawings[159].id,'NVDAUSDT:level-159');
});

test('archive preserves all enabled scalper lines instead of silently truncating after 16',()=>{
  const lines = Array.from({length:36},(_,i)=>({
    role:(i%3===0?'upper':i%3===1?'lower':'neckline') as 'upper'|'lower'|'neckline',
    from:{t:1000+i,p:100+i},to:{t:2000+i,p:101+i},
  }));
  const capture=buildArchivedChartSnapshot(base({scalperEnabled:true,scalperLines:lines}));
  assert.equal(capture.scalperLines.length,36);
  assert.deepEqual(capture.scalperLines[35],lines[35]);
  assert.equal(buildArchivedChartSnapshot(base({scalperEnabled:false,scalperLines:lines})).scalperLines.length,0);
});

test('Archive UI opens complete geometry on demand and exports using Blob rather than a huge data URL',()=>{
  const modal=read('../src/components/ArchiveModal.tsx');
  const routes=read('../server/pgIdentityRoutes.ts');
  const server=read('../server/pgIdentity.ts');
  assert.match(modal,/apiFetch\('\/api\/account\/archive\/' \+ encodeURIComponent\(item\.id\)\)/);
  assert.match(modal,/onSelectFormation\(result\.item as ArchivedFormation\)/);
  assert.match(modal,/apiFetch\('\/api\/account\/archive\/export'\)/);
  assert.match(modal,/response\.blob\(\)/);
  assert.match(modal,/URL\.createObjectURL\(archiveBlob\)/);
  assert.doesNotMatch(modal,/data:text\/json;charset=utf-8/);
  assert.match(routes,/app\.get\('\/api\/account\/archive\/export', requirePostgresSession/);
  assert.match(routes,/app\.get\('\/api\/account\/archive\/:id', requirePostgresSession/);
  assert.match(server,/jsonb_set\(payload,'\{chartSnapshot\}'/);
  assert.match(server,/\(payload->'chartSnapshot'\) - 'drawings' - 'scalperLines' - 'density'/);
  assert.match(server,/pg_advisory_xact_lock\(hashtext\(\$1\), 421\)/);
});

test('archive excludes disabled overlays and scalp lines instead of backfilling them',()=>{
  const snapshot=buildArchivedChartSnapshot(base({
    overlays:[],scalperEnabled:false,scalperLines:[],liquidationMap:{enabled:false,period:'24h'},
  }));
  assert.deepEqual(snapshot.overlays,[]);
  assert.deepEqual(snapshot.scalperLines,[]);
  assert.equal(snapshot.scalperEnabled,false);
  assert.equal(snapshot.liquidationMap.enabled,false);
});

test('TP SL Entry are never revived when hidden; support/neckline remain independently visible',()=>{
  const displayed=visibleArchivedMarkers(markers,{entry:false,target:true,stop:false});
  assert.deepEqual(displayed.map(x=>x.id),['tp','neck']);
  assert.deepEqual(visibleArchivedMarkers(markers,{entry:false,target:false,stop:false}).map(x=>x.id),['neck']);
});

test('image is bounded and stripped from user profile/archive list caches',()=>{
  const image='data:image/jpeg;base64,'+'a'.repeat(7500);
  const snapshot=buildArchivedChartSnapshot(base({image}));
  assert.equal(snapshot.image,image);
  const record={id:'test',chartSnapshot:snapshot} as ArchivedFormation;
  const copy=archiveWithoutVisualImage(record);
  assert.ok(!copy.chartSnapshot?.image);
  assert.equal(copy.chartSnapshot?.drawings,undefined);
  assert.equal(copy.chartSnapshot?.scalperLines,undefined);
  assert.equal(copy.chartSnapshot?.density,undefined);
  assert.equal(record.chartSnapshot?.image,image);
  assert.equal(record.chartSnapshot?.drawings.length,7,'alert drawing must not be saved');
  assert.ok(!buildArchivedChartSnapshot(base({image:'data:image/svg+xml,<script>alert(1)</script>'})).image);
  assert.ok(!buildArchivedChartSnapshot(base({image:'data:image/jpeg;base64,'+'a'.repeat(ARCHIVE_IMAGE_LIMIT)})).image);
});

test('archive saves only on-screen BID/ASK density marks when their visibility is on',()=>{
  const existing = [
    {id:'BTCUSDT:bid',side:'BID' as const,p:161.25,usd:250000,first:1000,last:1100,active:true,touches:2,reactionTier:'potential' as const,reactionScore:81},
    {id:'BTCUSDT:ask',side:'ASK' as const,p:166.5,usd:80000,first:1000,last:1100,active:false,touches:0},
    {id:'BTCUSDT:outside',side:'BID' as const,p:300,usd:9999999,first:1000,last:1100,active:true,touches:0},
  ];
  const active = visibleArchivedDensityScene(existing,
    {lines:true,labels:true,amounts:true},{low:160,high:170});
  assert.ok(active);
  assert.equal(active.markers.length,2);
  assert.deepEqual(active.markers.map(m=>m.side),['BID','ASK']);
  assert.equal(active.markers[0].usd,250000);
  assert.equal(active.markers[0].reactionTier,'potential');
  assert.equal(active.markers[0].firstSeenAt,1000);
  assert.equal(active.markers[1].active,false);
  const snapshot=buildArchivedChartSnapshot(base({density:active}));
  assert.deepEqual(snapshot.density,active);
  assert.equal('alerts' in snapshot, false);
});

test('disabled density marks never reach archive, including after previously enabled settings',()=>{
  const existing=[{id:'x',side:'BID' as const,p:100,usd:100000,first:100,last:150,active:true,touches:1}];
  const off = visibleArchivedDensityScene(existing,
    {lines:false,labels:false,amounts:true},{low:90,high:110});
  assert.equal(off,undefined);
  assert.equal(buildArchivedChartSnapshot(base({density:off})).density,undefined);
  assert.equal(buildArchivedChartSnapshot(base({density:{
    lines:false,labels:false,amounts:true,
    markers:[{id:'stale',side:'BID',price:100,usd:1000,firstSeenAt:100,lastSeenAt:150,active:true,touches:1}],
  }})).density,undefined);
  const linesOnly=visibleArchivedDensityScene(existing,
    {lines:true,labels:false,amounts:true},{low:90,high:110});
  assert.deepEqual({lines:linesOnly?.lines,labels:linesOnly?.labels,amounts:linesOnly?.amounts},
    {lines:true,labels:false,amounts:false});
  const labelsOnly=visibleArchivedDensityScene(existing,
    {lines:false,labels:true,amounts:false},{low:90,high:110});
  assert.equal(labelsOnly?.markers.length,1);
  assert.equal(labelsOnly?.amounts,false);
  assert.equal(visibleArchivedDensityScene(existing,
    {lines:true,labels:true,amounts:true},null),undefined);
});

test('BID/ASK metadata is bounded by visible viewport, with no silent truncation or live fetch',()=>{
  const existing=Array.from({length:150},(_,i)=>({
    id:'coin:'+i,side:(i%2?'ASK':'BID') as 'BID'|'ASK',p:100+i/100,
    usd:50000+i,first:1000,last:1100,active:true,touches:0,
  }));
  const scene=visibleArchivedDensityScene(existing,
    {lines:true,labels:true,amounts:true},{low:100,high:101.49});
  assert.equal(scene?.markers.length,150);
  const chart=read('../src/components/hookchart/HookChartCanvas.tsx');
  const engine=read('../src/components/hookchart/engine.tsx');
  assert.match(engine,/visibleArchivedDensityScene\(densities/);
  assert.match(engine,/g \? \{low:g\.lo,high:g\.hi\} : null/);
  assert.match(chart,/const density=engineRef\.current\?\.takeArchiveDensityScene\?\.\(\)/);
  assert.match(chart,/\.\.\.\(density \? \{density\} : \{\}\)/);
  assert.match(engine,/if\(showDensityLines\|\|showDensityLabels\)for\(const d of densities\)\{/);
  assert.match(engine,/if\(!\(d\.p>=g\.lo&&d\.p<=g\.hi\)\)continue/);
  assert.match(chart,/visibleChartDensities\(liveFeed\.densities, settings\.densityMode, settings\.densityAutoDisplay\)/);
});

test('single on-click canvas export excludes local alerts and strategy signals',()=>{
  const engine=read('../src/components/hookchart/engine.tsx');
  assert.match(engine,/const takeArchiveScreenshot=\(\):string\|null=>/);
  assert.match(engine,/draw\(true\)/);
  assert.match(engine,/finally\{draw\(false\)\}/);
  assert.match(engine,/if\(strategyResult&&!archiveCapture\)/);
  assert.match(engine,/\(archiveCapture \? \[\] : alerts\)\.filter/);
  assert.match(engine,/toDataURL\('image\/jpeg',quality\)/);
  assert.match(engine,/archiveScreenshotRef\.current=takeArchiveScreenshot/);
  assert.match(engine,/takeArchiveScreenshot:\(\)=>archiveScreenshotRef\.current\(\)/);
  const canvas=read('../src/components/hookchart/HookChartCanvas.tsx');
  for (const prop of ['autoSR','autoPrevDay','autoDayOpen','autoVWAP','autoLocalHL','autoRoundLevels','autoPOC','autoChannel','autoStops'])
    assert.ok(canvas.includes('runtimeSettings.'+prop));
  assert.match(canvas,/drawingsRef\.current\.filter\(d => d\.id\.startsWith\(symbol\+':'\)\)/);
  assert.match(canvas,/visibleScalperLines\(scalperResult, candles\)/);
  assert.match(canvas,/liquidationMap:\{ enabled:!!mapChartData && liquidationMapOn/);
});

test('save supports zero visible markers and archive view fetches just its owner image',()=>{
  const save=read('../src/context/ArchiveContext.tsx');
  assert.match(save,/options\?\.markers !== undefined/);
  assert.match(save,/options\?\.markers === undefined && formation\.levels\.necklinePrice/);
  const details=read('../src/components/FormationDetailsModal.tsx');
  assert.match(details,/markers: pendingArchiveCapture\.markers/);
  assert.match(details,/chartSnapshot: pendingArchiveCapture\.chartSnapshot/);
  assert.match(details,/archivedVisualAvailable&&!showLiveArchivedChart/);
  const server=read('../server/pgIdentity.ts');
  assert.match(server,/INSERT INTO auth_archive_chart_images/);
  assert.match(server,/SELECT image FROM auth_archive_chart_images WHERE user_id=\$1 AND id=\$2/);
  const routes=read('../server/pgIdentityRoutes.ts');
  assert.match(routes,/app\.get\('\/api\/account\/archive\/:id\/chart-image', requirePostgresSession/);
  assert.match(routes,/rateLimit\(req, 'archive-chart-image', 30, 60_000, false, res\.locals\.userId\)/);
  const migration=read('../server/migrations/001_identity.sql');
  assert.match(migration,/REFERENCES auth_archives\(user_id, id\) ON DELETE CASCADE/);
});
