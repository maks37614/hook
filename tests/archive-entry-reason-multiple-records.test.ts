import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  chartPageHash, readChartPageHash, sameChartPageRoute,
  saveChartPageSnapshot, readChartPageSnapshot, chartPageSnapshotKey,
} from '../src/utils/chartPageRoute';
import type { ArchivedFormation, ScannedCoin } from '../src/types';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const route = {
  exchange:'bybit' as const, marketType:'futures' as const,
  symbol:'BTCUSDT', timeframe:'1h' as const, kind:'archive' as const,
  formationId:'wm-001', archiveId:'arch_btcusdt_wm_001',
};

test('two saves of the same coin and pattern have distinct page URLs and restore independent marker sets', () => {
  const alternate={...route,archiveId:'arch_btcusdt_wm_002'};
  const hash1=chartPageHash(route);
  const hash2=chartPageHash(alternate);
  assert.notEqual(hash1,hash2);
  assert.deepEqual(readChartPageHash(hash1),route);
  assert.deepEqual(readChartPageHash(hash2),alternate);
  assert.equal(sameChartPageRoute(route,alternate),false);
  assert.notEqual(chartPageSnapshotKey(route,'user-123'),chartPageSnapshotKey(alternate,'user-123'));

  const coin:ScannedCoin={symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT',
    exchange:'bybit',marketType:'futures',timeframe:'1h',currentPrice:100,
    priceChange24h:0,volume24hUsd:0,highPrice24h:100,lowPrice24h:100,
    lastUpdated:1,exchangeUrl:'',formations:[]};
  const formation={id:'wm-001',name:'W/M'};
  const fake=(id:string,price:number)=>({id,formation,
    markers:[{id:'entry-'+id,type:'entry',price,color:'#fff'}]} as unknown as ArchivedFormation);
  const map=new Map<string,string>();
  const storage={setItem:(k:string,v:string)=>map.set(k,v),getItem:(k:string)=>map.get(k)??null};
  saveChartPageSnapshot(storage,'user-123',route,{coin,formation:formation as any,archived:fake(route.archiveId,100)});
  saveChartPageSnapshot(storage,'user-123',alternate,{coin,formation:formation as any,archived:fake(alternate.archiveId,110)});
  assert.equal(readChartPageSnapshot(storage,'user-123',route)?.archived?.markers[0].price,100);
  assert.equal(readChartPageSnapshot(storage,'user-123',alternate)?.archived?.markers[0].price,110);
  assert.equal(readChartPageSnapshot(storage,'other-user',route),null);
  const wrong={...route,archiveId:'arch_btcusdt_wm_003'};
  assert.equal(readChartPageSnapshot(storage,'user-123',wrong),null);
  // A tampered entry must fail even if the session-storage key is correct.
  saveChartPageSnapshot(storage,'user-123',route,{coin,formation:formation as any,
    archived:fake(alternate.archiveId,110)});
  assert.equal(readChartPageSnapshot(storage,'user-123',route),null);
});

test('legacy formation-based archive chart URLs remain readable', () => {
  const old={exchange:'bybit' as const,marketType:'futures' as const,
    symbol:'BTCUSDT',timeframe:'1h' as const,kind:'archive' as const,formationId:'wm-001'};
  assert.deepEqual(readChartPageHash(chartPageHash(old)),old);
  assert.equal(readChartPageHash('#/chart/bybit/futures/BTCUSDT/1h?kind=archive&record=%3Cbad%3E'),null);
});

test('entry reason is mandatory in four languages, persisted separately per record and appears in the archive card', () => {
  const dialog=read('../src/components/ArchiveEntryReasonDialog.tsx');
  const details=read('../src/components/FormationDetailsModal.tsx');
  const ctx=read('../src/context/ArchiveContext.tsx');
  const archive=read('../src/components/ArchiveModal.tsx');
  const server=read('../server/pgIdentity.ts');
  const chart=read('../src/components/SavedFormationChartPage.tsx');
  for(const language of ['uk','en','pl','ru']) assert.match(dialog,new RegExp('^  '+language+': \\{','m'));
  assert.match(dialog,/textarea id="archive-entry-reason" autoFocus required maxLength=\{ARCHIVE_ENTRY_REASON_MAX_LENGTH\}/);
  assert.match(dialog,/const trimmed = reason\.trim\(\)/);
  assert.match(details,/const \[pendingArchiveCapture, setPendingArchiveCapture\]/);
  assert.match(details,/onSave=\{confirmSaveToArchive\}/);
  assert.match(details,/entryReason,/);
  assert.doesNotMatch(details,/if \(alreadyArchived\)/);
  assert.match(ctx,/entryReason: reason|entryReason,/);
  assert.match(ctx,/crypto\.randomUUID\(\)/);
  assert.match(server,/body\.entryReason\.trim\(\)\.length > 500/);
  assert.match(archive,/item\.entryReason\?\.trim\(\)/);
  assert.match(chart,/archivedItem\.entryReason\?\.trim\(\)/);
});

test('candle reuse is market scoped; archive ID is intentionally absent from the candle cache key', () => {
  const page=read('../src/components/SavedFormationChartPage.tsx');
  const app=read('../src/App.tsx');
  assert.match(page,/\[user\?\.uid, archivedItem\.exchange, archivedItem\.marketType, symbol, timeframe\]\.join\(':'\)/);
  assert.match(page,/const cached = readCached\(scope\)/);
  assert.match(page,/archiveSnapshot=\{savedSnapshot\}/);
  assert.match(page,/markers=\{archivedItem\.markers \|\| \[\]\}/);
  assert.doesNotMatch(app,/key=\{selectedArchivedItem\.id\}/,
    'switching records of one market must not remount its shared candle chart');
  assert.match(app,/key=\{\[user\.uid, selectedArchivedItem\.exchange, selectedArchivedItem\.marketType,/,
    'different markets/timeframes should get a fresh chart with correct initial scope');
  assert.match(page,/key=\{scope\}/, 'changing the market or timeframe must still remount a chart');
  const canvas=read('../src/components/hookchart/HookChartCanvas.tsx');
  assert.match(canvas,/setReplayOverlays\(archiveOriginalScope \? \(archiveSnapshot\?\.overlays \|\| \[\]\) : \[\]\)/);
  assert.match(canvas,/archiveMode \? archiveDrawings\(archiveSnapshot, symbol\)/);
  assert.match(app,/kind: 'archive', formationId: archived\.formation\.id, archiveId: archived\.id/);
  assert.match(app,/const recordId = route\.archiveId \|\| archived\?\.id/);
});
