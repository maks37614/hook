import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARCHIVE_HISTORY_MAX_CANDLES, archiveHistoryPageLimit, mergeArchivedHistory } from '../src/utils/archiveHistory';
import type { Kline } from '../src/types';

const candle = (time: number, close = 10): Kline => ({
  time, open: close, high: close + 1, low: close - 1, close, volume: 3,
});
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('archive historical pages preserve newest WS candle on overlapping timestamps', () => {
  const recent = [candle(100, 11), candle(200, 12), candle(300, 13)];
  const historical = [candle(50, 9), candle(100, 5), candle(200, 5)];
  const combined = mergeArchivedHistory(recent, historical);
  assert.deepEqual(combined.map(row => row.time), [50,100,200,300]);
  assert.deepEqual(combined.map(row => row.close), [9,11,12,13]);
});

test('archive history excludes invalid bars and enforces 5k limit', () => {
  const recent = Array.from({length:ARCHIVE_HISTORY_MAX_CANDLES},(_,i)=>candle(i+1000));
  const older = Array.from({length:500},(_,i)=>candle(i+500));
  assert.deepEqual(mergeArchivedHistory(recent,older).map(x=>x.time),recent.map(x=>x.time));
  const combined=mergeArchivedHistory([candle(5),{...candle(6), low:0}], [candle(4)]);
  assert.deepEqual(combined.map(x=>x.time),[4,5]);
  assert.equal(archiveHistoryPageLimit(0),500);
  assert.equal(archiveHistoryPageLimit(4750),250);
  assert.equal(archiveHistoryPageLimit(5000),0);
  assert.equal(archiveHistoryPageLimit(6000),0);
});

test('archived automatic levels never recalculate from current market candles', () => {
  const canvas = read('../src/components/hookchart/HookChartCanvas.tsx');
  assert.match(canvas, /const frozenOverlayScene = archiveMode/);
  assert.match(canvas, /archiveOriginalScope \? \(archiveSnapshot\?\.overlayScene \?\? \{\}\) : \{\}/);
  assert.match(canvas, /autoLevels=\{archiveMode \? \[\] : visibleAutoLevels\}/);
  assert.match(canvas, /const channelEnabled = !archiveMode &&/);
  assert.match(canvas, /const channel = useMemo\(\(\) => channelEnabled/);
  assert.match(canvas, /archivedOverlayScene=\{frozenOverlayScene\}/);
});

test('archive button and canvas request one owner-scoped history loader', () => {
  const page = read('../src/components/SavedFormationChartPage.tsx');
  const hook = read('../src/components/hookchart/HookChartCanvas.tsx');
  assert.match(page, /olderRequestRef = useRef/);
  assert.match(page, /if \(pending\?\.scope === scope\) return pending\.promise/);
  assert.match(page, /activeScopeRef\.current !== scope/);
  assert.match(page, /const combined = mergeArchivedHistory\(previous\.rows, genuinelyOlder\)/);
  assert.match(page, /archiveOnNeedHistory=\{loadOlderHistory\}/);
  assert.match(hook, /if \(archiveMode && archiveOnNeedHistory\) return archiveOnNeedHistory\(timestamp\)/);
  assert.match(hook, /const maxChartCandles = archiveMode \? 5000/);
  assert.match(page, /endTime: cursor/);
  assert.match(page, /archiveHistoryPageLimit\(current\.length\)/);
});
