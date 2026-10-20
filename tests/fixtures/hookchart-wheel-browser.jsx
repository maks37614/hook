import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChevronDown, Expand, FolderArchive, Layers } from 'lucide-react';
import { Chart, ChartTimeAxis } from '../../src/components/hookchart/engine';
import '../../src/components/hookchart/hookchart.css';
import '../../src/components/hookchart/integration.css';

const candles = Array.from({ length: 120 }, (_, i) => ({
  t: 1_700_000_000_000 + i * 60_000, o: 10, h: 12, l: 8, c: 10 + Math.sin(i), v: 100, n: 0,
}));
const defaultViewport = { barWidth: 9, rightOffset: 0, autoY: true, manualCenter: null, manualRange: null, fitAll: false };
const risk = { score: 0, level: 'LOW', total5: 0, count5: 0, longUsd: 0, shortUsd: 0 };

function Fixture() {
  const [viewport, setViewport] = useState(defaultViewport);
  const [generation, setGeneration] = useState(0);
  const [drawings, setDrawings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [controlsContainer, setControlsContainer] = useState(null);
  const [countdownContainer, setCountdownContainer] = useState(null);
  globalThis.chartViewport = viewport;
  globalThis.remountChart = () => setGeneration(value => value + 1);
  return <div className="hookchart-root">
    <div className="chartStage">
      <Chart key={generation} candles={candles} symbol="BTCUSDT" tf="1m" tool="cursor"
        drawings={drawings} setDrawings={setDrawings} alerts={alerts} setAlerts={setAlerts}
        densities={[]} marketPrints={[]} liquidations={[]} autoLevels={[]} cascadeRisk={risk}
        levelLabelMode="always" rightPaddingBars={10} hideTimeJump hideBarCountdown={false} controlsContainer={controlsContainer} countdownContainer={countdownContainer} onViewportChange={setViewport} />
    </div>
    <ChartTimeAxis candles={candles} tf="1m" timezone="UTC" viewport={viewport} rightPaddingBars={10} countdownRef={setCountdownContainer} />
    <div className="hookchart-footer">
      <div className="hookchart-footer-controls" ref={setControlsContainer} />
      <div className="hookchart-footer-actions"><button type="button" className="hookchart-dom-toggle" aria-label="Відкрити стакан"><Layers size={14} /><ChevronDown size={14} /></button></div>
    </div>
  </div>;
}

createRoot(document.getElementById('root')).render(<StrictMode><Fixture /></StrictMode>);

globalThis.mountToolbarFixture = async () => {
  globalThis.chartActionClicks = { archive: 0, fullscreen: 0 };
  const [{ default: HookChartCanvas }, { AuthProvider }, { default: siteCss }] = await Promise.all([
    import('../../src/components/hookchart/HookChartCanvas'),
    import('../../src/context/AuthContext'),
    import('../../src/index.css?raw'),
  ]);
  const borderRules = siteCss.indexOf('/* Restore borders on the formation page chart and its controls only. */');
  if (borderRules < 0) throw new Error('Formation chart border styles are missing from the browser fixture');
  const style = document.createElement('style');
  style.textContent = siteCss.slice(borderRules);
  document.head.append(style);
  const account = { uid: 'offline-toolbar-fixture', email: 'offline@example.test', displayName: 'Offline fixture', isLocalUser: true };
  localStorage.setItem('signalhook_local_session', JSON.stringify({ accessToken: 'local.fixture-browser', expiresAt: Date.now() + 3600000, user: account, profile: { ...account, hookChartPreferences: { showTopToolbarIcons: true, indicators: ['rsi'] } } }));
  const host = document.createElement('div');
  host.id = 'toolbar-fixture';
  host.className = 'formation-details-chart-area';
  host.style.cssText = 'width:900px;height:430px';
  document.body.append(host);
  function ToolbarFixture() {
    const [timeframe, setTimeframe] = useState('1m');
    return <HookChartCanvas symbol="离线USDT" timeframe={timeframe} onTimeframeChange={setTimeframe} exchange="binance" marketType="futures"
      klines={candles.map(candle => ({ time: candle.t / 1000, open: candle.o, high: candle.h, low: candle.l, close: candle.c, volume: candle.v }))}
      chartActions={<>
        <button type="button" className="chart-archive-action" aria-label="Додати монету та формацію в архів" onClick={() => globalThis.chartActionClicks.archive++}><FolderArchive size={14} /></button>
        <button type="button" className="chart-fullscreen-action" aria-label="Відкрити повний графік" onClick={() => globalThis.chartActionClicks.fullscreen++}><Expand size={14} /></button>
      </>}
      footerActions={<button type="button" className="hookchart-dom-toggle" aria-label="Відкрити стакан"><Layers size={14} /><ChevronDown size={14} /></button>} />;
  }
  createRoot(host).render(<StrictMode><AuthProvider><ToolbarFixture /></AuthProvider></StrictMode>);
};

globalThis.mountAnalysisFixture = async () => {
  const [{ ChartTopAnalysisText }, { AuthProvider }] = await Promise.all([
    import('../../src/components/ChartTopAnalysisText'),
    import('../../src/context/AuthContext'),
    import('../../src/index.css'),
  ]);
  const host = document.createElement('div');
  host.id = 'analysis-fixture';
  document.body.append(host);
  createRoot(host).render(<AuthProvider><ChartTopAnalysisText
    coin={{ symbol: 'BTCUSDT', currentPrice: 83425.80, priceChange24h: -2.46, high24h: 91441.28, low24h: 82493.38 }}
    klines={[]} livePrice={83425.80} timeframe="1h" onTimeframeChange={() => {}} /></AuthProvider>);
};

globalThis.mountChartPageFixture = async () => {
  const [{ FormationDetailsModal }, { useChartPageRoute }, { AuthProvider }, { AlertsProvider }, { ArchiveProvider }, { detectFormations }] = await Promise.all([
    import('../../src/components/FormationDetailsModal'), import('../../src/utils/useChartPageRoute'),
    import('../../src/context/AuthContext'), import('../../src/context/AlertsContext'),
    import('../../src/context/ArchiveContext'), import('../../src/utils/patternRecognition'),
  ]);
  const account = { uid: 'offline-chart-page', email: 'offline@example.test', displayName: 'Offline', isLocalUser: true };
  localStorage.setItem('signalhook_local_session', JSON.stringify({ accessToken: 'local.fixture-browser', expiresAt: Date.now() + 3600000, user: account, profile: { ...account, defaultChartProvider: 'hookchart' } }));
  const rows = Array.from({ length: 40 }, (_, i) => ({ time: Math.floor(Date.now()/1000)-(41-i)*3600, open:99, high:100, low:98, close:99, volume:100 }));
  rows[39] = { ...rows[39], open:98.5, close:99.5, high:99.7, low:90 };
  const coin = { symbol:'BTCUSDT', baseAsset:'BTC', quoteAsset:'USDT', exchange:'binance', marketType:'futures', currentPrice:99.5, priceChange24h:1, volume24hUsd:1000000, timeframe:'1h', formations:[] };
  const formation = detectFormations(rows, coin.symbol).find(item => item.patternKey === 'hammer');
  const host = document.createElement('div');
  host.id = 'chart-page-fixture';
  document.body.replaceChildren(host);
  history.replaceState(null, '', '#screener');
  function RouteFixture() {
    const route = useChartPageRoute(account.uid);
    return <>
      {!route.active && <div data-original-page>Original page</div>}
      <FormationDetailsModal coin={coin} formation={formation} chartPage={route.active}
        onOpenChartPage={timeframe => route.open({coin, formation, timeframe})}
        onCloseChartPage={route.close} onClose={() => {}} />
    </>;
  }
  const root = createRoot(host);
  const render = () => root.render(<AuthProvider><AlertsProvider><ArchiveProvider><RouteFixture /></ArchiveProvider></AlertsProvider></AuthProvider>);
  render();
  globalThis.chartPageRows = rows;
};


// Two independent Terminal cards exercise hover, navigation and live-update stability.
globalThis.mountTerminalFixture = () => {
  const host = document.createElement('div');
  host.id = 'terminal-fixture';
  host.style.cssText = 'display:flex;gap:8px;width:940px;height:340px';
  document.body.append(host);
  globalThis.terminalViewports = {};
  const rows = Array.from({ length: 1000 }, (_, i) => ({ ...candles[i % candles.length], t: candles[0].t + i * 60_000 }));
  const formation = { id: 'terminal-pattern', detectedAt: rows[800].t, candleStartIndex: 10, candleEndIndex: 89 };
  function TerminalCard({ id }) {
    const [data, setData] = useState(rows);
    const [viewport, setViewport] = useState(defaultViewport);
    const [drawings, setDrawings] = useState([]);
    const [alerts, setAlerts] = useState([]);
    globalThis.terminalViewports[id] = viewport;
    if (id === 'left') globalThis.appendTerminalCandle = () => setData(previous => [...previous, { ...previous.at(-1), t: previous.at(-1).t + 60_000 }]);
    return <div data-terminal-card={id} className="hookchart-root hookchart-terminal" style={{ width:460, height:340 }}>
      <div className="chartStage"><Chart candles={data} symbol={id} tf="1m" tool="cursor" terminalMode focusFormation={formation}
        drawings={drawings} setDrawings={setDrawings} alerts={alerts} setAlerts={setAlerts}
        densities={[]} marketPrints={[]} liquidations={[]} autoLevels={[]} cascadeRisk={risk}
        levelLabelMode="always" rightPaddingBars={8} hideTimeJump hideBarCountdown controlsContainer={null} onViewportChange={setViewport} /></div>
      <ChartTimeAxis candles={data} tf="1m" timezone="UTC" viewport={viewport} rightPaddingBars={8}/>
    </div>;
  }
  createRoot(host).render(<StrictMode><TerminalCard id="left"/><TerminalCard id="right"/></StrictMode>);
};

globalThis.mountTerminalToolbarFixture = async () => {
  const [{ TerminalChartWidget }, { AuthProvider, useAuth }] = await Promise.all([
    import('../../src/components/terminal/TerminalChartWidget'),
    import('../../src/context/AuthContext'),
  ]);
  const account = { uid:'offline-terminal-toolbar', email:'offline@example.test', displayName:'Offline', isLocalUser:true };
  localStorage.setItem('signalhook_local_session', JSON.stringify({ accessToken: 'local.fixture-browser', expiresAt: Date.now() + 3600000, user:account, profile:{ ...account, defaultChartProvider:'hookchart' } }));
  const coins = Array.from({ length:30 }, (_, i) => ({
    symbol:i === 0 ? 'BTCUSDT' : i === 1 ? 'ETHUSDT' : `COIN${i}USDT`, baseAsset:i === 0 ? 'BTC' : i === 1 ? 'ETH' : `COIN${i}`,
    quoteAsset:'USDT', exchange:'binance', marketType:'futures', currentPrice:10, priceChange24h:0, volume24hUsd:1000, timeframe:'1m', formations:[],
  }));
  const host = document.createElement('div');
  host.id = 'terminal-toolbar-fixture';
  host.style.width = '900px';
  document.body.append(host);
  globalThis.terminalToolbarClicks = { fullscreen:0, remove:0, metaScalp:0, telegram:0 };
  function TerminalToolbarFixture() {
    const auth = useAuth();
    const [block, setBlock] = useState({ ...coins[0], id:'toolbar-block', mode:'tradingview', colSpan:1, heightPx:300 });
    globalThis.terminalToolbarBlock = block;
    globalThis.setTerminalToolbarMode = mode => setBlock(previous => ({ ...previous, mode }));
    globalThis.setTerminalToolbarProvider = provider => auth.updateProfileData({ defaultChartProvider:provider });
    return <TerminalChartWidget block={block} coin={coins.find(coin => coin.symbol === block.symbol)} allCoins={coins}
      isSingleBlock={false} isMaximized={false} onToggleMaximize={() => {}}
      onUpdateBlock={update => setBlock(previous => ({ ...previous, ...update }))}
      onOpenFullscreenModal={() => globalThis.terminalToolbarClicks.fullscreen++}
      onRemove={() => globalThis.terminalToolbarClicks.remove++}
      onSendMetaScalp={() => globalThis.terminalToolbarClicks.metaScalp++}
      onOpenTelegramAlerts={() => globalThis.terminalToolbarClicks.telegram++}
      onSplitBlock={() => setBlock(previous => ({ ...previous, mode:'tradingview' }))} />;
  }
  createRoot(host).render(<StrictMode><AuthProvider><TerminalToolbarFixture /></AuthProvider></StrictMode>);
};

// Exercise the actual top header with production styles and native browser input.
globalThis.mountHeaderFixture = async () => {
  const [{ Header }, { AuthProvider }, { LanguageProvider }] = await Promise.all([
    import('../../src/components/Header'), import('../../src/context/AuthContext'), import('../../src/context/LanguageContext'),
  ]);
  localStorage.removeItem('signalhook_local_session');
  const host = document.createElement('div');
  host.id = 'header-fixture';
  document.body.replaceChildren(host);
  window.scrollTo(0, 0);
  globalThis.headerActionClicks = { auth: 0 };
  const noop = () => {};
  createRoot(host).render(<StrictMode><AuthProvider><LanguageProvider><Header
    isLoading={false} totalCoins={100} formationsCount={12} bullishCount={7} bearishCount={5}
    watchlistCount={0} soundEnabled onToggleSound={noop} onRefresh={noop}
    onOpenWatchlist={noop} onOpenArchive={noop} onOpenGuide={noop} onOpenMetaScalp={noop}
    lastUpdated={null} onOpenTelegramAlerts={noop} onOpenAuth={() => globalThis.headerActionClicks.auth++}
    activePage="screener" onPageChange={noop} />
  </LanguageProvider></AuthProvider></StrictMode>);
};

