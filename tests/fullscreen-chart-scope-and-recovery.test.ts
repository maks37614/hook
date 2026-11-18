import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  fullscreenChartHistoryScope, scopedFullscreenChartKlines, sameFullscreenMarket,
} from '../src/utils/fullscreenChartScope';
import type { Kline } from '../src/types';

const view = readFileSync(new URL('../src/components/FullscreenChartModal.tsx', import.meta.url), 'utf8');
const row = { time: 1, open: 1, high: 2, low: 1, close: 2, volume: 10 } as Kline;

test('same symbol on Binance and Bybit never shares its fullscreen history', () => {
  const a = fullscreenChartHistoryScope('binance', 'futures', 'SOL/USDT', '1h');
  const b = fullscreenChartHistoryScope('bybit', 'futures', 'SOLUSDT', '1h');
  assert.notEqual(a, b);
  assert.equal(a, fullscreenChartHistoryScope('binance', 'futures', 'SOLUSDT', '1h'));
  assert.notEqual(a, fullscreenChartHistoryScope('binance', 'spot', 'SOLUSDT', '1h'));
  assert.notEqual(a, fullscreenChartHistoryScope('binance', 'futures', 'SOLUSDT', '15m'));
});

test('full-screen graph never exposes the prior interval or instrument while switching', () => {
  const old = fullscreenChartHistoryScope('binance', 'futures', 'SOLUSDT', '1h');
  const data = { scope: old, rows: [row] };
  assert.deepEqual(scopedFullscreenChartKlines(data, old), [row]);
  assert.deepEqual(scopedFullscreenChartKlines(data, fullscreenChartHistoryScope('binance', 'futures', 'SOLUSDT', '5m')), []);
  assert.deepEqual(scopedFullscreenChartKlines(data, fullscreenChartHistoryScope('binance', 'futures', 'BTCUSDT', '1h')), []);
  assert.deepEqual(scopedFullscreenChartKlines(null, old), []);
});

test('a previous exchange or symbol cannot supply the full-screen live price', () => {
  const sol = { symbol: 'SOLUSDT', exchange: 'binance' as const, marketType: 'futures' as const };
  assert.equal(sameFullscreenMarket(sol, { ...sol, symbol: 'SOL/USDT' }), true);
  assert.equal(sameFullscreenMarket(sol, { ...sol, symbol: 'BTCUSDT' }), false);
  assert.equal(sameFullscreenMarket(sol, { ...sol, exchange: 'bybit' }), false);
  assert.equal(sameFullscreenMarket(sol, { ...sol, marketType: 'spot' }), false);
  assert.match(view, /trackedPrice\?\.marketKey === marketKey/);
  assert.match(view, /trackedStatus\?\.statusKey === statusKey/);
  assert.match(view, /const statusKey = marketKey \+ ':' \+ timeframe/);
  assert.match(view, /onLivePriceUpdate=\{reportPrice\}/);
  assert.match(view, /onLiveStatusChange=\{reportStatus\}/);
});

test('fullscreen history uses parent candles rather than refetching; failures show retry', () => {
  assert.match(view, /if \(!isOpen \|\| hasSuppliedHistory\) return/);
  assert.match(view, /setHistoryRequest\(\{ scope, status: 'loading' \}\)/);
  assert.match(view, /signal: AbortSignal\.any\(\[controller\.signal, AbortSignal\.timeout\(12_000\)\]\)/);
  assert.match(view, /<TradingViewChart[\s\S]*?historyManagedByParent/);
  assert.match(view, /return \(\) => \{ cancelled = true; controller.abort\(\); \}/);
  assert.match(view, /if \(cancelled \|\| controller.signal.aborted\) return/);
  assert.match(view, /const historyStatus = hasSuppliedHistory \? 'ready'/);
  assert.match(view, /historyStatus === 'failed'/);
  assert.match(view, /const showEarlyLevels = !!earlyCandidate && samePropMarket/);
  assert.match(view, /setHistoryRetry\(value => value \+ 1\)/);
  assert.match(view, /klines=\{activeKlines\}/);
});

test('hydrating the profile archive does not reopen an ordinary standalone chart', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /const routeArchives = chartRoute\?\.kind === 'archive' && !chartRoute\.archiveId \? archivedFormations : null/);
  assert.match(app, /if \(route.kind === 'archive' && !stored\) \{\s*const archived = routeArchives\?\.find/);
  assert.match(app, /\}, \[chartRouteKey, user\?\.uid, authLoading, routeArchives\]\)/);
});

test('closing HookChart settings with Escape keeps the fullscreen chart open', () => {
  assert.match(view, /if \(e\.key === 'Escape' && !e\.defaultPrevented\)/);
  const settings = readFileSync(new URL('../src/components/hookchart/OriginalHookChartSettings.tsx', import.meta.url), 'utf8');
  assert.match(settings, /if \(event\.key === 'Escape'\) \{\s*event\.preventDefault\(\);\s*onClose\(\)/);
  assert.match(settings, /window\.addEventListener\('keydown', onKeyDown, true\)/);
});

test('formation page shows disconnected until the WebSocket status is actually reported', () => {
  const source = readFileSync(new URL('../src/components/FormationDetailsModal.tsx', import.meta.url), 'utf8');
  assert.match(source, /const \[liveStatus, setLiveStatus\] = useState<\{ isConnected: boolean; mode: 'ws' \| 'rest' \}>\(\{\s*isConnected: false,\s*mode: 'rest'/);
  assert.match(source, /onLiveStatusChange=\{setLiveStatus\}/);
});

test('favorite navigation never carries the previous formation, markers or archive controls', () => {
  assert.match(view, /const activeFormation = samePropMarket \? formation : null/);
  assert.match(view, /if \(!displayedEarlyCandidate\) return samePropMarket \? customMarkers : undefined/);
  assert.match(view, /formation=\{activeFormation\}/);
  assert.match(view, /onAddToArchive=\{samePropMarket \? onAddToArchive : undefined\}/);
  assert.match(view, /isArchived=\{samePropMarket \? isArchived : false\}/);
  assert.match(view, /savedChartParams=\{samePropMarket \? savedChartParams : undefined\}/);
  // Secondary full-screen chart slots must not receive the former chart's
  // formation target or name when a Telegram alert is opened.
  assert.match(view, /targetPrice: selectedHeaderSlot \? undefined : activeFormation\?\.levels.targetPrice/);
  assert.match(view, /formationName: selectedHeaderSlot \? undefined : activeFormation\?\.name/);
  assert.doesNotMatch(view, /formation=\{formation\}/);
});
