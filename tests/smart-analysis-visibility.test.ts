import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SmartAnalysisData, CoinGeckoHolderSnapshot } from '../src/types';
import {
  getSmartAnalysisVisibility,
  selectVisibleTab,
  isMeasured,
} from '../src/utils/smartAnalysisVisibility';

function emptyAnalysis(): SmartAnalysisData {
  return {
    btcContext: {
      btcPrice: null, change24h: null, priceSource: null, available: false,
      timeframes: {
        '15m': { direction: 'sideways', structure: 'unknown', label: 'missing' },
        '5m': { direction: 'sideways', structure: 'unknown', label: 'missing' },
        '1m': { direction: 'sideways', structure: 'unknown', label: 'missing' },
      },
      overallStructure: 'unknown', upcomingNews: [],
    },
    trend: { rsi14: NaN, ema20: NaN, ema50: NaN, ema200: null },
    volumeMetrics: { volume1hUsd: null, volume24hUsd: null },
    spread: { spreadPct: null, spreadUsd: null, quality: 'unavailable' },
    volatility: { positionInDayRangePct: null, low24h: null, high24h: null },
    orderbook: {
      available: false, bidAskRatio: null,
      bidWallPrice: null, bidWallUsd: null,
      askWallPrice: null, askWallUsd: null, largeOrders: [],
    },
    levels: { pocPrice: null, liquidityLevels: [], strongSupport: NaN, strongResistance: NaN },
    derivatives: {
      hasPerpFutures: false, binanceOI: {currentUsd:null, change1hPct:null, history:[]},
      bybitOI: {currentUsd:null, change1hPct:null, history:[]},
      fundingRate: null, predictedFundingRate: null, totalOIUsd: null,
    },
    participants: {
      largePlayer: {clusterVolumeUsd:null, trackedClusters:[]},
      marketMaker: {detected:null, activityLevel:'unknown'},
      manipulativeCoin: {riskScore:null, signals:[]},
    },
  } as unknown as SmartAnalysisData;
}

const provider = (count: number | null, status: CoinGeckoHolderSnapshot['status'] = 'available'):
  CoinGeckoHolderSnapshot => ({
  source: 'CoinGecko Demo', symbol: 'DEMO', status, count,
  distribution: {top_10:0}, network:'eth',
  contractAddress:'0x'+'a'.repeat(40), lastUpdated:null, detail:'',
});

test('no unverified data -> no module tabs and no placeholder cards', () => {
  const visibility = getSmartAnalysisVisibility(emptyAnalysis(), null);
  assert.deepEqual(visibility.modules, {
    btc:false, tech:false, orderbook:false, derivatives:false, institutional:false,
  });
  assert.equal(visibility.holders,false);
  assert.equal(visibility.marketMaker,false);
  assert.equal(visibility.btcTimeframes.length,0);
  assert.equal(selectVisibleTab('institutional',visibility.modules),'all');
});

test('native CoinGecko coins and ambiguous tickers never render Holders', () => {
  for(const status of ['native_unsupported','ambiguous','unmapped','rate_limited'] as const) {
    const show = getSmartAnalysisVisibility(emptyAnalysis(),provider(null,status));
    assert.equal(show.holders,false);
    assert.equal(show.modules.institutional,false);
  }
});

test('verified zero values must remain visible', () => {
  const data=emptyAnalysis();
  data.btcContext.change24h=0;
  data.trend.rsi14=0;
  data.spread.spreadPct=0;
  data.derivatives.hasPerpFutures=true;
  data.derivatives.fundingRate=0;
  data.participants.manipulativeCoin.riskScore=0;
  data.participants.manipulativeCoin.signals=[{
    name:'measured',detected:false,severity:'low',description:'measured zero',
  }];
  const v=getSmartAnalysisVisibility(data,provider(0));
  assert.equal(isMeasured(0),true);
  assert.equal(isMeasured(null),false);
  assert.equal(isMeasured(NaN),false);
  assert.equal(v.modules.btc,true);
  assert.equal(v.modules.tech,true);
  assert.equal(v.modules.derivatives,true);
  assert.equal(v.modules.institutional,true);
  assert.equal(v.holders,true);
  assert.equal(v.holderConcentration,true);
  assert.equal(v.binanceFunding,true);
  assert.equal(v.vulnerability,true);
  assert.equal(v.modules.orderbook,false);
});

test('partial available data preserves the tab and hides only empty items', () => {
  const data=emptyAnalysis();
  data.btcContext.timeframes['5m'].structure='HH_HL';
  data.btcContext.timeframes['5m'].direction='up';
  data.orderbook.available=true;
  data.orderbook.bidWallUsd=120000;
  data.orderbook.bidWallPrice=200;
  data.orderbook.bidAskRatio=1.2;
  data.derivatives.hasPerpFutures=true;
  data.derivatives.bybitOI.currentUsd=150000;
  const v=getSmartAnalysisVisibility(data,null);
  assert.deepEqual(v.btcTimeframes,['5m']);
  assert.equal(v.btcPrice,false);
  assert.equal(v.btcNews,false);
  assert.equal(v.bid,true);
  assert.equal(v.ask,false);
  assert.equal(v.poc,false);
  assert.equal(v.binanceOI,false);
  assert.equal(v.bybitOI,true);
  assert.equal(v.binanceFunding,false);
  assert.equal(v.modules.orderbook,true);
  assert.equal(v.modules.derivatives,true);
  assert.equal(selectVisibleTab('derivatives',v.modules),'derivatives');
  assert.equal(selectVisibleTab('institutional',v.modules),'all');
});

test('market maker stays hidden when only an exchange spread is available', () => {
  const d=emptyAnalysis();
  d.spread.spreadPct=0.00012;
  const v=getSmartAnalysisVisibility(d,null);
  assert.equal(v.modules.tech,true);
  assert.equal(v.marketMaker,false);
  assert.equal(v.modules.institutional,false);
});

test('spot pairs hide all futures-only OI and funding even if stale fields survive', () => {
  const d=emptyAnalysis();
  d.derivatives.binanceOI.currentUsd=1000;
  d.derivatives.fundingRate=0.004;
  const v=getSmartAnalysisVisibility(d,null);
  assert.equal(v.modules.derivatives,false);
});

test('all Smart Analysis sections are guarded, not only the navigation tabs', () => {
  const ui=readFileSync(new URL('../src/components/SmartAnalysisBlock.tsx',import.meta.url),'utf8');
  for(const module of ['btc','tech','orderbook','derivatives','institutional']) {
    assert.match(ui,new RegExp("showModule\\('"+module+"'\\) &&"));
  }
  assert.match(ui,/tabs\.filter\(tab => visible\.modules\[tab\.id\]\)/);
  assert.match(ui,/selectVisibleTab\(activeTab, visible\.modules\)/);
  assert.match(ui,/visible\.holders &&/);
  assert.match(ui,/visible\.largeOrders &&/);
  assert.match(ui,/visible\.marketMaker &&/);
  assert.match(ui,/visible\.vulnerability &&/);
  assert.match(ui,/visible\.btcNews &&/);
  assert.match(ui,/visible\.binanceFunding/);
  assert.match(ui,/visible\.bybitFunding/);
  assert.doesNotMatch(ui,/Календар новин не підключено|н\/д · немає історії|Одного зрізу стакана недостатньо/);
});
