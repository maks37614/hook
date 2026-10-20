// Offline React/DOM integration check. No browser sessions or live accounts are used.
import './offline-network.mjs';
import './offline-firebase.mjs';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
registerHooks({ load(url, context, next) { if (url.endsWith('.css'))
        return { format: 'module', source: 'export default {};', shortCircuit: true }; return next(url, context); } });
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const window = dom.window;
window.HTMLElement.prototype.scrollIntoView = function () {};
for (const key of ['window', 'document', 'location', 'Element', 'Text', 'Node', 'NodeFilter', 'localStorage', 'navigator', 'HTMLElement', 'HTMLCanvasElement', 'MutationObserver', 'Event', 'MouseEvent', 'getComputedStyle'])
    Object.defineProperty(globalThis, key, { value: key === 'window' ? window : window[key], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = ((query) => ({ matches: false, media: query, addListener() { }, removeListener() { }, addEventListener() { }, removeEventListener() { } }));
const labels = [];
const canvasFrames = new Map();
const canvasTexts = new Map();
const canvasStrokes = new Map();
const dedicatedPriceScaleFills = frame => frame.filter(fill => fill.args[0] === 850 && fill.args[1] === 0 && fill.args[2] === 50 && fill.args[3] === 350);
let paints = 0;
window.HTMLCanvasElement.prototype.getContext = function () {
    const canvas = this;
    const fills = [];
    const texts = [];
    const strokes = [];
    let path = [];
    canvasFrames.set(canvas, fills);
    canvasTexts.set(canvas, texts);
    canvasStrokes.set(canvas, strokes);
    const context = { canvas, measureText: (text) => ({ width: String(text).length * 6, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 3 }),
        createLinearGradient: () => ({ addColorStop() { } }), createRadialGradient: () => ({ addColorStop() { } }),
        getLineDash: () => context.dash || [], setLineDash: dash => { context.dash = dash; },
        fillText: (text, ...args) => { labels.push(String(text)); texts.push({ text: String(text), color: context.fillStyle, font: context.font, align: context.textAlign, baseline: context.textBaseline, args }); },
    };
    return new Proxy(context, { get(target, key) { return key in target ? target[key] : (...args) => { if (key === 'fillRect') {
            paints++; fills.push({ color: target.fillStyle, args }); } for (const arg of args)
            if (typeof arg === 'number')
                assert.ok(Number.isFinite(arg), `canvas ${String(key)} contains a non-finite coordinate`);
            if (key === 'beginPath') path = [];
            if (key === 'moveTo' || key === 'lineTo') path.push({ kind: key, args });
            if (key === 'stroke' || key === 'strokeRect') strokes.push({ kind: key, color: target.strokeStyle, dash: [...(target.dash || [])], path: [...path], args });
        }; }, set(target, key, value) { target[key] = value; return true; } });
};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,offline-fixture';
window.HTMLElement.prototype.getBoundingClientRect = function () { return { width: 900, height: this.tagName === 'CANVAS' ? 350 : 380, top: 0, left: 0, right: 900, bottom: 380, x: 0, y: 0, toJSON() { } }; };
for (const [key, value] of [['clientWidth', 900], ['offsetWidth', 900], ['clientHeight', 380], ['offsetHeight', 380]])
    Object.defineProperty(window.HTMLElement.prototype, key, { get: () => value, configurable: true });
class Observer {
    static instances = new Set();
    targets = new Set();
    callback;
    constructor(callback) {
        this.callback = callback;
        Observer.instances.add(this);
    }
    notify() {
        if (!this.targets.size) return;
        this.callback([...this.targets].map(target => {
            const contentRect = target.getBoundingClientRect();
            return { target, contentRect, borderBoxSize: [{ inlineSize: contentRect.width, blockSize: contentRect.height }] };
        }), this);
    }
    observe(target) { this.targets.add(target); queueMicrotask(() => this.notify()); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); Observer.instances.delete(this); }
}
globalThis.ResizeObserver = Observer;
window.ResizeObserver = Observer;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
class Socket {
    url;
    static instances = [];
    constructor(url) {
        this.url = new URL(url).searchParams.get('source') || url;
        Socket.instances.push(this);
        setTimeout(() => { if (this.readyState !== 3) this.onopen?.({}); }, 0);
    }
    onopen;
    onmessage;
    onerror;
    onclose;
    send(value) { if (JSON.parse(value).type === 'auth') this.onmessage?.({ data: '{"type":"hook2.ready"}' }); }
    close() { this.readyState = 3; }
    static OPEN = 1;
    readyState = 1;
}
globalThis.WebSocket = Socket;
window.WebSocket = Socket;
const candles = Array.from({ length: 80 }, (_, i) => ({ time: 1_700_000_000 + i * 60, open: 10, high: 12, low: 8, close: 10 + Math.sin(i), volume: 100 }));
let fixtureCandles = candles;
const account = { uid: 'offline-chart-fixture', email: 'offline@example.test', displayName: 'Offline fixture', isLocalUser: true };
localStorage.setItem('signalhook_local_session', JSON.stringify({ accessToken: 'local.fixture-account', expiresAt: Date.now() + 3600000, user: account, profile: { ...account, defaultChartProvider: 'hookchart', timeZone: 'Europe/Kyiv', hookChartPreferences: { rightPadding: 150, rightPaddingVersion: 1 } } }));
globalThis.fetch = async input => new Response(JSON.stringify(String(input).includes('/smart-analysis')
    ? { success: false, error: 'Analysis unavailable in the offline fixture' }
    : { success: true, data: fixtureCandles, alerts: [], history: [] }), { status: 200 });
const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { AuthProvider, useAuth } = await import('../../src/context/AuthContext.tsx');
const { TradingViewChart } = await import('../../src/components/TradingViewChart.tsx');
const { ReplayChart } = await import('../../src/components/replay/ReplayChart.tsx');
const { AlertsProvider } = await import('../../src/context/AlertsContext.tsx');
const { ArchiveProvider } = await import('../../src/context/ArchiveContext.tsx');
const { LanguageProvider, useLanguage } = await import('../../src/context/LanguageContext.tsx');
const { translatePhrase } = await import('../../src/locales/index.ts');
const { translateHookChartPhrase, hookChartLanguagePacks } = await import('../../src/locales/hookchartLanguage.ts');
const { UserProfileModal } = await import('../../src/components/UserProfileModal.tsx');
const { TerminalChartWidget } = await import('../../src/components/terminal/TerminalChartWidget.tsx');
const { FullscreenChartModal } = await import('../../src/components/FullscreenChartModal.tsx');
const { Header } = await import('../../src/components/Header.tsx');
const { getFallbackScannedCoins } = await import('../../src/utils/directExchangeClient.ts');
const coin = getFallbackScannedCoins()[0];
let auth;
let languageApi;
let showLanguageHeader;
const chartActionClicks = { archive: 0, fullscreen: 0 };
let updateArchiveState;
const chartHandle = React.createRef();
function Harness() {
    auth = useAuth();
    languageApi = useLanguage();
    const [languageHeaderVisible, setLanguageHeaderVisible] = React.useState(false);
    showLanguageHeader = setLanguageHeaderVisible;
    const [timeframe, setTimeframe] = React.useState('1m');
    const [archiveState, setArchiveState] = React.useState({ saved: false, saving: false });
    updateArchiveState = setArchiveState;
    const [block, setBlock] = React.useState({ id: 'fixture-terminal', symbol: coin.symbol, baseAsset: coin.baseAsset, quoteAsset: coin.quoteAsset, exchange: coin.exchange, marketType: coin.marketType, timeframe: '1m', mode: 'tradingview' });
    return React.createElement('div', {},
        languageHeaderVisible && React.createElement(Header, { isLoading: false, totalCoins: 1, formationsCount: 0, bullishCount: 0, bearishCount: 0, watchlistCount: 0, lastUpdated: null, activePage: 'screener' }),
        React.createElement(UserProfileModal, { isOpen: true, onClose() { } }),
        React.createElement(TerminalChartWidget, { block, allCoins: [coin], isSingleBlock: false, isMaximized: false, onToggleMaximize() { }, onRemove() { }, onUpdateBlock(update) { setBlock(previous => ({ ...previous, ...update })); }, watchlist: [], onToggleWatchlist() { } }),
        React.createElement(FullscreenChartModal, { isOpen: true, onClose() { }, coin, currentTimeframe: '1m', klines: candles }),
        React.createElement(TradingViewChart, { klines: candles, symbol: '龙虾USDT', timeframe, onTimeframeChange: setTimeframe, onAddToArchive() { chartActionClicks.archive++; setArchiveState({ saved: false, saving: true }); }, onOpenFullscreen() { chartActionClicks.fullscreen++; }, isArchived: archiveState.saved, isSavingArchive: archiveState.saving, exchange: 'binance', marketType: 'futures', savedChartParams: { visibleRange: { from: 0, to: 100 } }, customMarkers: [{ id: 'entry', type: 'entry', label: 'Fixture Entry', price: 10, color: '#00ff00' }, { id: 'support', type: 'support', label: 'Fixture Support', price: 9, color: '#a855f7' }, { id: 'resistance', type: 'resistance', label: 'Fixture Resistance', price: 11, color: '#a855f7' }], fullHeight: true }),
        React.createElement(ReplayChart, { ref: chartHandle, visibleCandles: candles.slice(0, 40), symbol: 'BTCUSDT', timeframe: '1m', exchange: 'binance', marketType: 'futures', position: { side: 'long', entryPrice: 10, tpPrice: 11, slPrice: 9, liquidationPrice: 8 }, pendingOrders: [], isReplaying: false }));
}
const root = createRoot(document.getElementById('root'));
await act(async () => { root.render(React.createElement(AuthProvider, {}, React.createElement(AlertsProvider, {}, React.createElement(ArchiveProvider, {}, React.createElement(LanguageProvider, {}, React.createElement(Harness)))))); await new Promise(resolve => setTimeout(resolve, 250)); });
await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)); });
assert.equal(document.querySelectorAll('[data-chart-provider="hookchart"]').length, 4);
assert.equal(document.querySelector('#profile-chart-provider').value, 'hookchart', 'profiles without a saved provider select HookChart by default');
assert.ok(paints > 20, 'hookchart must paint real candles');
for (const chart of document.querySelectorAll('[data-chart-provider="hookchart"]')) {
    assert.equal(chart.querySelectorAll('.chartScaleDock').length, 1, 'each chart owns one scale toolbar');
    assert.ok(chart.querySelector('.hookchart-footer .chartScaleDock'), 'scale controls belong in the bottom footer');
    assert.equal(chart.querySelector('.chartStage .chartScaleDock'), null, 'scale controls must not cover candles');
    const frame = canvasFrames.get(chart.querySelector('.chartWrap > canvas'));
    assert.equal(dedicatedPriceScaleFills(frame).length, 0, 'price scale no longer paints an opaque 50px column');
    const corner = chart.querySelector('.chartTimeScaleSpacer');
    assert.equal(corner.textContent, corner.querySelector('.barCountdown')?.textContent || '', 'bottom right overlay displays only the timer without a location label');
    assert.equal(chart.querySelector('.toolbarExchange'), null, 'the upper toolbar must not contain BIN/BYB exchange buttons');
    if (chart.classList.contains('hookchart-terminal')) {
        assert.equal(chart.querySelectorAll('.hookchart-toolbar').length, 1, 'terminal cards restore exactly one original top toolbar');
        assert.equal(chart.querySelector('.terminalChartSettings'), null, 'the replacement floating settings button is removed');
        assert.equal(chart.closest('.terminal-chart-block').querySelector('select[aria-label^="Таймфрейм"]'), null, 'the replacement header timeframe picker is removed');
        assert.ok(chart.querySelector('.hookchart-footer > .marketStatsBar'), 'terminal market statistics return to the bottom panel');
        for (const label of ['Vol 24h:', 'Max:', 'Min:', 'Corr BTC:', 'Vol:']) {
            assert.ok(chart.querySelector('.marketStatsBar').textContent.includes(translateHookChartPhrase('uk', label)), 'the restored panel includes ' + label);
        }
        assert.equal(chart.closest('.terminal-chart-block').querySelector(':scope > .terminal-chart-header'), null, 'HookChart removes the outer header row');
        const controls = chart.querySelector('.hookchart-toolbar .terminal-chart-integrated-toolbar');
        assert.ok(controls, 'terminal block controls share the existing timeframe toolbar');
        assert.equal(chart.querySelector('.hookchart-footer .terminal-chart-header'), null, 'block controls leave the footer');
        assert.ok(controls.querySelector('button[title="Змінити монету"]'), 'coin selection remains available');
        assert.ok(controls.querySelector('button[title="Закрити графік"]'), 'block removal remains available');
        assert.equal(chart.closest('.terminal-chart-block').getAttribute('draggable'), 'false', 'plot gestures must not drag the workspace block');
        assert.equal(chart.closest('.terminal-chart-block').querySelector('.terminal-chart-drag-handle').getAttribute('draggable'), 'true', 'workspace drag is limited to its handle');
    }
    const bars = frame.filter(fill => ['#0ECB81', '#F6465D'].includes(fill.color) && fill.args[2] <= 9);
    const lastBarRight = Math.max(...bars.map(fill => fill.args[0] + fill.args[2]));
    assert.ok(lastBarRight > 0 && lastBarRight < (chart.classList.contains('hookchart-terminal') ? 900 : 850), 'configured right padding still leaves future candle space while the plot extends under the scale');
    assert.equal(chart.querySelector('.chartTimePlot').style.width, '900px', 'time axis uses the full chart width beneath the scale overlay');
    for (const clip of chart.querySelectorAll('.indicatorPanel clipPath rect'))
        assert.equal(clip.getAttribute('width'), '900', 'indicator plots extend beneath their right-side labels');
}
assert.ok(labels.includes('Fixture Entry'), 'formation/archive marker must appear on the canvas');
assert.equal(chartHandle.current.takeScreenshot(), 'data:image/png;base64,offline-fixture');
let live = document.querySelectorAll('[data-chart-provider="hookchart"]')[2];
const chartActions = live.querySelector('.hookchart-toolbar .toolbarRight .hookchart-chart-actions');
assert.ok(chartActions, 'archive and fullscreen actions belong in the upper toolbar');
assert.equal(chartActions.previousElementSibling.getAttribute('aria-label'), 'Налаштування hookchart', 'both actions follow the settings button');
assert.equal(chartActions.querySelectorAll('button').length, 2, 'the toolbar has exactly two action buttons');
assert.equal(live.querySelector('.chartStage .hookchart-chart-actions'), null, 'actions no longer cover the candle plot');
assert.equal(live.parentElement.parentElement.querySelector('.chart-above-controls'), null, 'HookChart must not retain an empty row above its toolbar');
const archiveAction = chartActions.querySelector('button[aria-label="Додати монету та формацію в архів"]');
await act(async () => { archiveAction.click(); });
assert.equal(chartActionClicks.archive, 1, 'the moved archive button invokes the original handler');
assert.equal(archiveAction.disabled, true, 'saving still disables the archive button');
await act(async () => { archiveAction.click(); chartActions.querySelector('button[aria-label="Відкрити повний графік"]').click(); });
assert.deepEqual(chartActionClicks, { archive: 1, fullscreen: 1 }, 'fullscreen works during saving and the archive button prevents duplicate saves');
await act(async () => { updateArchiveState({ saved: true, saving: false }); });
assert.ok(chartActions.querySelector('button[aria-label="Формацію збережено в архіві"]:not(:disabled)'), 'saved formations retain their saved state after moving');
const footer = live.querySelector('.hookchart-footer');
assert.ok(live.querySelector('.chartTimeAxis .chartTimeScaleSpacer .barCountdown'), 'live countdown belongs below the chart in the right time-axis corner above the order book');
assert.equal(footer.querySelector('.barCountdown'), null, 'the countdown must leave the scale-control row');
assert.equal(live.querySelector('.chartTimeScaleSpacer').getAttribute('aria-hidden'), null, 'the timer must remain accessible');
assert.ok(footer.querySelector('.hookchart-footer-actions .hookchart-dom-toggle'), 'order book action shares the scale-control footer');
assert.ok(footer.firstElementChild.classList.contains('marketStatsBar'), 'market statistics start the shared bottom row');
assert.ok(footer.children[1].contains(footer.querySelector('.scaleReset')), 'Reset remains to the right of market statistics');
assert.ok(footer.lastElementChild.contains(footer.querySelector('.hookchart-dom-toggle')), 'order book action remains at the end of the statistics row');
const liveCanvas = live.querySelector('.chartWrap > canvas');
const barsOn = canvas => {
    const frame = canvasFrames.get(canvas);
    return frame.filter(fill => ['#0ECB81', '#F6465D'].includes(fill.color) && fill.args[2] <= 9);
};
const currentBars = () => barsOn(liveCanvas);
const widthBefore = currentBars().at(-1).args[2];
await act(async () => { footer.querySelector('button[aria-label="Збільшити масштаб"]').click(); });
assert.ok(currentBars().at(-1).args[2] > widthBefore, 'the footer + button must zoom the chart');
await act(async () => { footer.querySelector('button[aria-label="Зменшити масштаб"]').click(); });
assert.ok(currentBars().at(-1).args[2] <= widthBefore + 1, 'the footer minus button must zoom back out');
await act(async () => { footer.querySelector('.scaleReset').click(); });
const barRight = () => Math.max(...currentBars().map(fill => fill.args[0] + fill.args[2]));
const rightBeforePan = barRight();
await act(async () => { liveCanvas.dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 300, clientY: 120, deltaX: -240 })); });
assert.ok(barRight() < rightBeforePan - 100, 'horizontal navigation must freely open more future space');
await act(async () => { footer.querySelector('.scaleReset').click(); });
assert.equal(barRight(), rightBeforePan, 'Reset returns to the configured candle margin');
const otherCanvas = document.querySelectorAll('[data-chart-provider="hookchart"]')[0].querySelector('.chartWrap > canvas');
const otherWidths = barsOn(otherCanvas).map(fill => fill.args[2]);
const otherLastX = barsOn(otherCanvas).at(-1).args[0];
const hover = async (canvas, x = 300) => act(async () => {
    canvas.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body, clientX: x, clientY: 175 }));
});
document.querySelector('#profile-chart-provider').focus();
await hover(liveCanvas);
assert.equal(document.activeElement, liveCanvas, 'hovering the plot focuses the chart without requiring a click');
const wheelOn = async (canvas, options) => {
    const wheel = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 300, clientY: 175, ...options });
    await act(async () => { canvas.dispatchEvent(wheel); });
    assert.equal(wheel.defaultPrevented, true, 'wheel input over the chart must cancel page scrolling');
    return wheel;
};
const widthBeforeWheel = currentBars().at(-1).args[2];
await wheelOn(liveCanvas, { deltaY: -120 });
assert.ok(currentBars().at(-1).args[2] > widthBeforeWheel, 'the mouse wheel zooms the chart under the cursor');
assert.deepEqual(barsOn(otherCanvas).map(fill => fill.args[2]), otherWidths, 'wheel input must leave other charts unchanged');
await wheelOn(liveCanvas, { deltaY: 120 });
assert.ok(Math.abs(currentBars().at(-1).args[2] - widthBeforeWheel) <= 1);
const horizontalBeforePriceWheel = currentBars().map(fill => [fill.args[0], fill.args[2]]);
const maxBarHeight = () => Math.max(...currentBars().map(fill => fill.args[3]));
const heightBeforePriceWheel = maxBarHeight();
document.querySelector('#profile-chart-provider').focus();
await hover(liveCanvas, 875);
assert.equal(document.activeElement, liveCanvas, 'hovering the price scale focuses its chart');
await wheelOn(liveCanvas, { clientX: 875, deltaY: -120, shiftKey: true });
assert.ok(maxBarHeight() > heightBeforePriceWheel, 'price-scale wheel input stretches candles vertically');
assert.deepEqual(currentBars().map(fill => [fill.args[0], fill.args[2]]), horizontalBeforePriceWheel, 'price-scale input must leave the horizontal range and candle widths unchanged');
await wheelOn(liveCanvas, { clientX: 875, deltaY: 120, ctrlKey: true });
assert.ok(Math.abs(maxBarHeight() - heightBeforePriceWheel) <= 1, 'the reverse price-scale wheel input compresses candles');
assert.deepEqual(currentBars().map(fill => [fill.args[0], fill.args[2]]), horizontalBeforePriceWheel);
const pageWheel = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 });
document.querySelector('#profile-chart-provider').dispatchEvent(pageWheel);
assert.equal(pageWheel.defaultPrevented, false, 'page scrolling remains available outside the chart even while it has focus');
await act(async () => { liveCanvas.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, key: '-', code: 'Minus' })); });
assert.ok(currentBars().at(-1).args[2] < widthBeforeWheel, 'zoom hotkeys act on the chart focused by hover');
assert.deepEqual(barsOn(otherCanvas).map(fill => fill.args[2]), otherWidths, 'hover focus must isolate keyboard shortcuts to the active chart');
const liveWidthAfterHotkey = currentBars().at(-1).args[2];
await hover(otherCanvas);
assert.equal(document.activeElement, otherCanvas, 'hover transfers focus to another chart');
await act(async () => { otherCanvas.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, key: '-', code: 'Minus' })); });
assert.equal(currentBars().at(-1).args[2], liveWidthAfterHotkey, 'shortcuts follow hover focus instead of the previous chart');
assert.notEqual(barsOn(otherCanvas).at(-1).args[0], otherLastX, 'terminal zoom shortcuts change candle spacing even when body widths round to the same pixel');
await act(async () => { footer.querySelector('.scaleReset').click(); });
assert.equal(barRight(), rightBeforePan);
const hud = live.querySelector('.liqRiskContent');
const widthBeforeHudWheel = currentBars().at(-1).args[2];
await wheelOn(hud, { deltaY: -120 });
assert.ok(currentBars().at(-1).args[2] > widthBeforeHudWheel, 'wheel input over a chart HUD must control the chart instead of the page');
await act(async () => { footer.querySelector('.scaleReset').click(); });
await wheelOn(live.querySelector('.chartTimePlot'), { clientY: 370, deltaY: -120 });
assert.ok(currentBars().at(-1).args[2] > widthBeforeHudWheel, 'the separate time axis must capture wheel input');
await act(async () => { footer.querySelector('.scaleReset').click(); });
assert.equal(barRight(), rightBeforePan);
await act(async () => { live.querySelector('button[aria-label="Налаштування hookchart"]').click(); });
const settingsPanel = () => document.querySelector('body > .hookchart-settings-portal .originalSettingsPanel');
assert.ok(settingsPanel(), 'settings are mounted at document.body, not inside a chart tile');
assert.equal(live.querySelector('.originalSettingsPanel'), null, 'settings do not inherit chart tile clipping');
const settingRow = label => [...settingsPanel().querySelectorAll('.settingRow')].find(row => row.querySelector('.settingText > b').textContent === label);
const srVisibility = () => settingRow('Показувати підтримку та опір').querySelector('input');
const srLabels = () => settingRow('Показувати мітки S/R').querySelector('input');
assert.equal(srVisibility().checked, false);
assert.equal(srLabels().checked, true);
const purpleLines = () => canvasStrokes.get(liveCanvas).filter(stroke => stroke.color === '#a855f7');
const purpleLabels = () => canvasTexts.get(liveCanvas).filter(label => ['Fixture Support 1m', 'Fixture Resistance 1m'].includes(label.text));
assert.equal(purpleLines().length, 0, 'disabled S/R also hides purple formation/archive levels');
await act(async () => { srVisibility().click(); });
assert.equal(live.querySelector('.hookchart-toolbar button[aria-label="Підтримка та опір"]').getAttribute('aria-pressed'), 'true');
assert.ok(purpleLines().length >= 2, 'enabling S/R restores both purple level lines');
assert.equal(purpleLabels().length, 2);
await act(async () => { srLabels().click(); await new Promise(resolve => setTimeout(resolve, 750)); });
assert.ok(purpleLines().length >= 2, 'the labels switch preserves the purple lines');
assert.equal(purpleLabels().length, 0, 'the labels switch hides formation/archive S/R captions too');
assert.equal(canvasFrames.get(liveCanvas).some(fill => fill.color === '#a855f7'), false, 'hidden S/R labels do not leave purple price-axis badges');
assert.equal(auth.profile.hookChartPreferences.autoSR, true);
assert.equal(auth.profile.hookChartPreferences.showSRLabels, false);
assert.equal(JSON.parse(localStorage.getItem(`signalhook_profile_${account.uid}`)).hookChartPreferences.showSRLabels, false);
await act(async () => { srLabels().click(); });
await act(async () => { srVisibility().click(); });
assert.equal(live.querySelector('.hookchart-toolbar button[aria-label="Підтримка та опір"]').getAttribute('aria-pressed'), 'false');
assert.equal(purpleLines().length, 0, 'turning S/R off immediately removes the purple lines');
assert.equal(purpleLabels().length, 0);
assert.ok(canvasTexts.get(liveCanvas).some(label => label.text === 'Fixture Entry'), 'entry markers retain their own visibility');
const levelIntervals = () => [...settingRow('Таймфрейми автовизначення рівнів').querySelectorAll('button')];
assert.deepEqual(levelIntervals().map(button => [button.textContent, button.getAttribute('aria-pressed')]), [['5m', 'false'], ['15m', 'false'], ['1h', 'true'], ['4h', 'true'], ['1d', 'true']].map(([tf, selected]) => [translatePhrase('uk', tf), selected]));
assert.equal(levelIntervals()[0].disabled, false, '5m can be added while the three default timeframes are selected');
await act(async () => { levelIntervals()[0].click(); await new Promise(resolve => setTimeout(resolve, 750)); });
assert.deepEqual(new Set(auth.profile.hookChartPreferences.levelIntervals), new Set(['5m', '1h', '4h', '1d']));
await act(async () => { levelIntervals()[1].click(); await new Promise(resolve => setTimeout(resolve, 750)); });
assert.deepEqual(new Set(auth.profile.hookChartPreferences.levelIntervals), new Set(['5m', '15m', '1h', '4h', '1d']), 'all five detection intervals can be selected together');
await act(async () => { levelIntervals()[2].click(); });
assert.equal(levelIntervals()[2].getAttribute('aria-pressed'), 'false', 'each detection interval can be disabled independently');
await act(async () => { levelIntervals()[2].click(); });
await act(async () => {
    const size = settingRow('Розмір міток рівнів').querySelector('input');
    assert.equal(size.min, '0.2');
    assert.equal(size.step, '0.1');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(size, '0.2');
    size.dispatchEvent(new window.Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 750));
});
assert.equal(auth.profile.hookChartPreferences.levelLabelSize, 0.2, 'the minimum fractional size saves without rounding');
assert.equal(JSON.parse(localStorage.getItem(`signalhook_profile_${account.uid}`)).hookChartPreferences.levelLabelSize, 0.2);
await act(async () => {
    const color = settingRow('Колір міток рівнів').querySelector('input');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(color, '#f2a900');
    color.dispatchEvent(new window.Event('input', { bubbles: true }));
});
await act(async () => {
    const size = settingRow('Розмір міток рівнів').querySelector('input');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(size, '16');
    size.dispatchEvent(new window.Event('input', { bubbles: true }));
});
await act(async () => { [...settingRow('Тип міток рівнів').querySelectorAll('button')].find(button => button.textContent === 'Із заливкою').click(); });
await act(async () => { [...settingRow('Тип ліній рівнів').querySelectorAll('button')].find(button => button.textContent === 'Пунктир').click(); await new Promise(resolve => setTimeout(resolve, 750)); });
const savedLevelAppearance = { ...auth.profile.hookChartPreferences };
assert.equal(savedLevelAppearance.levelLabelColor, '#f2a900');
assert.equal(savedLevelAppearance.levelLabelSize, 16);
assert.equal(savedLevelAppearance.levelLabelStyle, 'filled');
assert.equal(savedLevelAppearance.levelLineStyle, 'dash');
assert.deepEqual(JSON.parse(localStorage.getItem(`signalhook_profile_${account.uid}`)).hookChartPreferences.levelIntervals, savedLevelAppearance.levelIntervals, 'selected detection intervals persist to the account');
const paddingToggle = settingRow('Відступ праворуч').querySelector('input');
const paddingCount = settingRow('Кількість свічок').querySelector('input');
assert.equal(paddingToggle.checked, true);
assert.equal(paddingCount.value, '10');
await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(paddingCount, '5');
    paddingCount.dispatchEvent(new window.Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 750));
});
assert.equal(auth.profile.hookChartPreferences.rightPadding, 5, 'the requested candle count must save to the profile');
assert.equal(auth.profile.hookChartPreferences.rightPaddingVersion, 2, 'saved padding is measured in candles');
assert.ok(Math.abs(barRight() - rightBeforePan - 45) < 1, 'changing 10 candles to 5 removes five candle widths of space');
await act(async () => { paddingToggle.click(); await new Promise(resolve => setTimeout(resolve, 750)); });
assert.equal(paddingCount.disabled, true);
assert.equal(auth.profile.hookChartPreferences.rightPaddingEnabled, false);
assert.ok(barRight() >= 897 && barRight() <= 900, 'disabling padding lets candles reach beneath the price-scale overlay');
await act(async () => { paddingToggle.click(); await new Promise(resolve => setTimeout(resolve, 750)); });
assert.equal(paddingCount.disabled, false);
assert.equal(paddingCount.value, '5', 'enabling padding retains the selected candle count');
assert.equal(auth.profile.hookChartPreferences.rightPaddingEnabled, true);
assert.ok(Math.abs(barRight() - rightBeforePan - 45) < 1);
await act(async () => { settingsPanel().querySelector('button[aria-label="Закрити"]').click(); });
await act(async () => { footer.querySelector('.scaleDockToggle').click(); });
assert.equal(footer.querySelector('.scaleTools'), null, 'footer scale toolbar can collapse');
await act(async () => { footer.querySelector('.scaleDockToggle').click(); });
assert.ok(footer.querySelector('.scaleReset'), 'footer scale toolbar can expand');
for (const chart of document.querySelectorAll('[data-chart-provider="hookchart"]')) {
    const toggle = chart.querySelector('.drawPanelToggle');
    assert.ok(toggle, 'hookchart exposes the original drawing toolbar toggle');
    assert.equal(chart.querySelector('.floatingDrawTools'), null, 'original drawing toolbar starts collapsed');
    await act(async () => { toggle.click(); });
    assert.equal(chart.querySelector('.floatingDrawTools').getAttribute('aria-orientation'), 'vertical');
    assert.equal(chart.querySelector('.hookchart-toolbar').getAttribute('aria-orientation'), 'horizontal');
    assert.ok(chart.querySelector('.chartStage .floatingDrawTools button[aria-label="Горизонтальний рівень"]'), 'drawing tools belong inside the chart on the left');
    assert.equal(chart.querySelector('.hookchart-toolbar button[aria-label="Горизонтальний рівень"]'), null);
}
const replay = document.querySelectorAll('[data-chart-provider="hookchart"]')[3];
assert.equal(replay.querySelector('.barCountdown'), null, 'the replay chart must not show a live countdown');
assert.equal(replay.querySelector('.hookchart-timeframes button'), null, 'replay timeframe must remain controlled by the simulator');
const stream = Socket.instances.filter(socket => socket.url.includes(encodeURIComponent('龙虾')) && socket.url.includes('kline_')).at(-1);
await act(async () => { stream.onmessage({ data: JSON.stringify({ data: { e: 'kline', k: { t: candles.at(-1).time * 1000, o: '10', h: '12', l: '8', c: '11.5', v: '105' } } }) }); await new Promise(resolve => setTimeout(resolve, 200)); });
assert.ok(labels.includes('11.50'), 'live WebSocket ticks must repaint hookchart');

await act(async () => { live.querySelector('button[aria-label="Індикатори"]').click(); });
const rsiButton = live.querySelector('.indicatorDrawer button[aria-label="RSI"]');
await act(async () => { rsiButton.click(); await new Promise(resolve => setTimeout(resolve, 750)); });
assert.equal(rsiButton.getAttribute('aria-pressed'), 'true');
assert.equal(auth.profile.hookChartPreferences.rightPadding, 5, 'saving unrelated settings retains the chosen candle margin');
assert.equal(auth.profile.hookChartPreferences.rightPaddingVersion, 2, 'later settings changes must not repeat the migration');
assert.equal(replay.querySelector('.indicatorDrawer'), null, 'opening a drawer must not open other chart drawers');
const indicatorSvg = live.querySelector('.indicatorPanel svg');
assert.equal(Number(indicatorSvg.getAttribute('viewBox').split(' ')[2]), live.getBoundingClientRect().width, 'newly enabled indicators must align with the measured chart width');

await act(async () => { live.querySelector('button[aria-label="Поріг щільностей"]').click(); });
assert.ok(live.querySelector('.densityQuickPopup'), 'density tools open before collapsing the upper toolbar');
await act(async () => { live.querySelector('.topToolbarToggle').click(); });
assert.equal(live.querySelector('.topToolbarToggle').getAttribute('aria-expanded'), 'false');
assert.equal(live.querySelector('.densityQuickPopup'), null, 'collapsing closes the density popup');
assert.equal(live.querySelector('.densityQuickWrap'), null, 'collapsing hides density tools');
assert.equal(live.querySelector('.autoOverlayTools'), null, 'collapsing hides all quick overlay tools');
assert.ok(live.querySelector('button[aria-label="Таймфрейм 5m"]'), 'timeframe controls remain visible when tools are collapsed');
assert.equal(live.querySelectorAll('.toolbarRight .hookchart-chart-actions button').length, 2, 'archive and fullscreen actions remain available when tools are collapsed');
await act(async () => { live.querySelector('button[aria-label="Налаштування hookchart"]').click(); });
assert.ok(settingsPanel(), 'fullscreen settings remain usable when tools are collapsed');
await act(async () => { settingsPanel().querySelector('button[aria-label="Закрити"]').click(); });
await act(async () => { live.querySelector('.topToolbarToggle').click(); });
assert.equal(live.querySelector('.topToolbarToggle').getAttribute('aria-expanded'), 'true');
assert.ok(live.querySelector('.autoOverlayTools'), 'expanding restores quick overlay tools');
assert.equal(live.querySelector('.densityQuickPopup'), null, 'expanding must not reopen a stale density popup');

await act(async () => { live.querySelector('.hookchart-toolbar button[aria-label="Підтримка та опір"]').click(); await new Promise(resolve => setTimeout(resolve, 750)); });
assert.ok(auth.profile.hookChartPreferences.overlays.includes('sr'), 'top toolbar toggles must save automatic levels');
await act(async () => { live.querySelector('.hookchart-toolbar button[aria-label="Налаштування hookchart"]').click(); });
const srSetting = [...live.querySelectorAll('.hookchart-options label')].find(label => label.textContent === 'Підтримка та опір').querySelector('input');
assert.equal(srSetting.checked, true, 'settings and quick overlay buttons must share the same state');
assert.equal(live.querySelector('.indicatorDrawer'), null, 'settings and indicator drawers must not overlap');
await act(async () => { settingsPanel().querySelector('button[aria-label="Закрити"]').click(); });

const nameInput = document.querySelector("input[placeholder=\"Ваше ім'я\"]");
await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(nameInput, 'Unsaved draft'); nameInput.dispatchEvent(new window.Event('input', { bubbles: true })); });
await act(async () => {
    live.querySelector('button[aria-label="Горизонтальний рівень"]').click();
});
await act(async () => { live.querySelector('canvas').dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 250, clientY: 120 })); await new Promise(resolve => setTimeout(resolve, 750)); });
assert.ok(Object.values(auth.profile.hookChartPreferences.drawings).some((rows) => rows.length === 1), 'drawings must save to the profile');
await act(async () => { live.querySelector('button[aria-label="Індикатори"]').click(); });
await act(async () => { live.querySelector('button[aria-label="Згорнути панель малювання"]').click(); await new Promise(resolve => setTimeout(resolve, 750)); });
assert.equal(live.querySelector('.floatingDrawTools'), null);
assert.equal(live.querySelector('.indicatorDrawer'), null);
assert.equal(auth.profile.hookChartPreferences.drawingToolbarOpen, false);
await act(async () => { live.querySelector('canvas').dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 250, clientY: 120 })); });
assert.equal(auth.profile.hookChartPreferences.drawings['live:binance:futures:龙虾USDT'].length, 1, 'collapsing the palette must leave drawing mode');
await act(async () => { live.querySelector('button[aria-label="Розгорнути панель малювання"]').click(); await new Promise(resolve => setTimeout(resolve, 750)); });
assert.equal(live.querySelector('button[aria-label="Курсор"]').getAttribute('aria-pressed'), 'true');
await act(async () => { live.querySelector('button[aria-label="Таймфрейм 5m"]').click(); await new Promise(resolve => setTimeout(resolve, 200)); });
live = document.querySelectorAll('[data-chart-provider="hookchart"]')[2];
assert.equal(live.querySelector('button[aria-label="Таймфрейм 5m"]').getAttribute('aria-pressed'), 'true');
assert.ok(Socket.instances.some(socket => socket.url.includes(encodeURIComponent('龙虾')) && socket.url.includes('kline_5m')), 'timeframe buttons must update the live subscription');
assert.equal(auth.profile.hookChartPreferences.drawings['live:binance:futures:龙虾USDT'].length, 1, 'changing timeframe must retain drawings');
const terminal = document.querySelectorAll('[data-chart-provider="hookchart"]')[0];
await act(async () => { terminal.querySelector('button[aria-label="Таймфрейм 15m"]').click(); await new Promise(resolve => setTimeout(resolve, 200)); });
assert.equal(document.querySelectorAll('[data-chart-provider="hookchart"]')[0].querySelector('button[aria-label="Таймфрейм 15m"]').getAttribute('aria-pressed'), 'true', 'the restored terminal timeframe controls must update their block');
const fullscreen = document.querySelectorAll('[data-chart-provider="hookchart"]')[1];
await act(async () => { fullscreen.querySelector('button[aria-label="Таймфрейм 1h"]').click(); await new Promise(resolve => setTimeout(resolve, 200)); });
assert.equal(document.querySelectorAll('[data-chart-provider="hookchart"]')[1].querySelector('button[aria-label="Таймфрейм 1h"]').getAttribute('aria-pressed'), 'true', 'fullscreen timeframe controls must update its data');
const select = document.querySelector('#profile-chart-provider');
await act(async () => { select.value = 'tradingview'; select.dispatchEvent(new window.Event('change', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 100)); });
assert.equal(document.querySelectorAll('[data-chart-provider="hookchart"]').length, 0);
const detachedWheel = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 });
liveCanvas.dispatchEvent(detachedWheel);
assert.equal(detachedWheel.defaultPrevented, false, 'unmounting removes the chart wheel listener');
assert.equal(document.querySelectorAll('[data-chart-provider="tradingview"]').length, 2);
assert.equal(document.querySelectorAll('.chart-above-controls button[aria-label="Формацію збережено в архіві"]').length, 1, 'TradingView retains its existing archive controls without duplicates');
assert.equal(document.querySelectorAll('iframe').length, 2, 'embedded terminal and fullscreen charts must restore TradingView');
assert.ok(document.querySelector('.terminal-chart-block > .terminal-chart-header'), 'TradingView retains its original outer header');
assert.equal(document.querySelector('.terminal-chart-integrated-toolbar'), null, 'TradingView does not render HookChart toolbar controls');
assert.equal(JSON.parse(localStorage.getItem('signalhook_profile_offline-chart-fixture')).defaultChartProvider, 'tradingview');
await act(async () => { select.value = 'hookchart'; select.dispatchEvent(new window.Event('change', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 100)); });
assert.equal(document.querySelectorAll('[data-chart-provider="hookchart"]').length, 4);
assert.equal(auth.profile.defaultChartProvider, 'hookchart');
assert.equal(document.querySelectorAll('iframe').length, 0, 'hookchart must replace every embedded TradingView chart');
assert.equal(nameInput.value, 'Unsaved draft', 'provider auto-save must not erase other profile drafts');
await act(async () => { await Promise.all([auth.updateProfileData({ hookChartPreferences: { drawings: { OTHER: [] } } }), auth.updateProfileData({ timeZone: 'UTC' })]); });
assert.equal(auth.profile.timeZone, 'UTC');
assert.ok(auth.profile.hookChartPreferences.drawings['live:binance:futures:龙虾USDT'].length);
assert.deepEqual(auth.profile.hookChartPreferences.drawings.OTHER, []);

// Chart packs apply within both the canvas shell and the settings portal. A chart
// language choice remains independent until the next site language selection.
const chartRoots = () => [...document.querySelectorAll('[data-chart-provider="hookchart"]')];
const settleLanguageSave = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 750)); });
const openLanguageSettings = async () => act(async () => { chartRoots()[0].querySelector('.chartSettingsBtn').click(); });
const assertChartLanguage = language => {
    for (const chart of chartRoots()) {
        assert.equal(chart.dataset.hookchartLanguage, language);
        assert.equal(chart.querySelector('.scaleReset').textContent, hookChartLanguagePacks[language].Reset);
    }
    if (settingsPanel()) {
        assert.equal(settingsPanel().closest('[data-hookchart-language]').dataset.hookchartLanguage, language);
        assert.equal(settingsPanel().querySelector('.settingsHeader b').textContent, hookChartLanguagePacks[language]['Настройки графика']);
        assert.equal(settingsPanel().querySelector(`button[value="${language}"]`).getAttribute('aria-pressed'), 'true');
    }
};
await openLanguageSettings();
for (const language of ['en', 'pl', 'ru', 'uk']) {
    await act(async () => { settingsPanel().querySelector(`button[value="${language}"]`).click(); });
    await settleLanguageSave();
    assertChartLanguage(language);
    assert.equal(document.documentElement.lang, 'uk', 'manual chart selection does not change the site language');
    assert.equal(auth.profile.hookChartPreferences.language, language);
    assert.equal(JSON.parse(localStorage.getItem(`signalhook_profile_${account.uid}`)).hookChartPreferences.language, language);
}
await act(async () => { languageApi.setLanguage('pl'); });
await settleLanguageSave();
assertChartLanguage('pl');
assert.equal(document.documentElement.lang, 'pl');
await act(async () => { settingsPanel().querySelector('button[value="en"]').click(); });
await settleLanguageSave();
assertChartLanguage('en');
// Unmount every chart, change the site language, then open the charts again.
await act(async () => { select.value = 'tradingview'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
await act(async () => { languageApi.setLanguage('ru'); });
await act(async () => { select.value = 'hookchart'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
await settleLanguageSave();
assertChartLanguage('ru');
await openLanguageSettings();
await act(async () => { settingsPanel().querySelector('button[value="en"]').click(); });
await settleLanguageSave();
await act(async () => { select.value = 'tradingview'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
await act(async () => { select.value = 'hookchart'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
await settleLanguageSave();
assertChartLanguage('en');
assert.equal(document.documentElement.lang, 'ru', 'remounting restores the saved chart language without changing the site');
await act(async () => { showLanguageHeader(true); });
await act(async () => { select.value = 'tradingview'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
assert.equal(chartRoots().length, 0);
for (const language of ['pl', 'ru']) {
    await act(async () => {
        const siteSelect = document.querySelector('header select');
        siteSelect.value = language;
        siteSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    assert.equal(auth.profile.hookChartPreferences.language, language, 'the real site selector persists chart language without a mounted chart');
}
await act(async () => { select.value = 'hookchart'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
await settleLanguageSave();
assertChartLanguage('ru');
await act(async () => { languageApi.setLanguage('uk'); });
await settleLanguageSave();
assertChartLanguage('uk');
assert.ok(auth.profile.hookChartPreferences.drawings['live:binance:futures:龙虾USDT'].length, 'language sync preserves drawings');
await act(async () => { root.unmount(); });

// Model desktop grid dimensions, then notify the real renderers as a browser's
// ResizeObserver would. Canvas sizes must follow layout without remounting.
window.HTMLElement.prototype.getBoundingClientRect = function () {
    const column = this.closest('[tabindex="-1"]');
    const span = Number([...column?.classList || []].find(name => /^lg:col-span-\d+$/.test(name))?.split('-').at(-1) || 3);
    const width = this.style.width.endsWith('px') ? parseFloat(this.style.width) : column ? (1200 - 48) / 3 * span + 24 * (span - 1) : 1200;
    const height = this.style.height.endsWith('px') ? parseFloat(this.style.height) : 380;
    return { width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON() { } };
};
for (const key of ['clientWidth', 'offsetWidth'])
    Object.defineProperty(window.HTMLElement.prototype, key, { get() { return this.getBoundingClientRect().width; }, configurable: true });
for (const key of ['clientHeight', 'offsetHeight'])
    Object.defineProperty(window.HTMLElement.prototype, key, { get() { return this.getBoundingClientRect().height; }, configurable: true });
let scrolledElement;
window.HTMLElement.prototype.scrollIntoView = function () { scrolledElement = this; };
const { FormationDetailsModal } = await import('../../src/components/FormationDetailsModal.tsx');
const { detectFormations } = await import('../../src/utils/patternRecognition.ts');
const patternCandles = Array.from({ length: 40 }, (_, i) => ({ time: Math.floor(Date.now() / 1000) - (41 - i) * 3600, open: 99, high: 100, low: 98, close: 99, volume: 100 }));
patternCandles[39] = { ...patternCandles[39], open: 98.5, close: 99.5, high: 99.7, low: 90 };
const formation = detectFormations(patternCandles, coin.symbol).find(row => row.patternKey === 'hammer');
assert.ok(formation);
fixtureCandles = patternCandles;
const formationCoin = { ...coin, currentPrice: 99.5 };
function FormationHarness({ show = true }) {
    auth = useAuth();
    return show ? React.createElement(FormationDetailsModal, { coin: formationCoin, formation, onClose() { } }) : null;
}
let formationRoot;
async function renderFormation(show = true) {
    await act(async () => {
        formationRoot.render(React.createElement(AuthProvider, {}, React.createElement(AlertsProvider, {}, React.createElement(ArchiveProvider, {}, React.createElement(FormationHarness, { show })))));
        await new Promise(resolve => setTimeout(resolve, 100));
    });
    await act(async () => { for (const observer of Observer.instances) observer.notify(); await new Promise(resolve => setTimeout(resolve, 100)); });
}
const panel = () => document.getElementById('formation-trade-setup-panel');
const panelToggle = expanded => document.querySelector(`button[aria-controls="formation-trade-setup-panel"][aria-expanded="${expanded}"]`);
const analysisBlock = () => document.querySelector('.smart-analysis-block');
const analysisToggle = () => analysisBlock().querySelector('button[aria-controls]');
const analysisContent = () => document.getElementById(analysisToggle().getAttribute('aria-controls'));
async function clickAnalysisToggle() {
    await act(async () => { analysisToggle().click(); await new Promise(resolve => setTimeout(resolve, 30)); });
}
async function clickPanelToggle(expanded) {
    assert.ok(panelToggle(expanded));
    await act(async () => { panelToggle(expanded).click(); await new Promise(resolve => setTimeout(resolve, 50)); });
    await act(async () => { for (const observer of Observer.instances) observer.notify(); await new Promise(resolve => setTimeout(resolve, 100)); });
}
formationRoot = createRoot(document.getElementById('root'));
await renderFormation();
assert.equal(panel().hidden, false, 'profiles without a saved preference start expanded');
assert.equal(analysisToggle().getAttribute('aria-expanded'), 'false', 'smart analysis starts collapsed when the profile has no preference');
assert.equal(analysisContent().hidden, true);
assert.ok(analysisBlock().textContent.includes('Біржові дані'), 'the analysis heading remains visible when collapsed');
const firstAnalysisToggle = analysisToggle();
firstAnalysisToggle.focus();
await clickAnalysisToggle();
assert.equal(analysisToggle().getAttribute('aria-expanded'), 'true');
assert.equal(analysisContent().hidden, false);
assert.equal(auth.profile.smartAnalysisCollapsed, false, 'expansion is saved to the profile');
assert.equal(JSON.parse(localStorage.getItem(`signalhook_profile_${account.uid}`)).smartAnalysisCollapsed, false);
assert.ok(document.activeElement === firstAnalysisToggle, 'the same toggle keeps keyboard focus after expansion');
assert.ok(analysisContent().textContent.includes('Analysis unavailable in the offline fixture'), 'analysis errors retain the collapse control');

const analysisFetch = globalThis.fetch;
let releaseAnalysis;
globalThis.fetch = (input, ...args) => String(input).includes('/smart-analysis')
    ? new Promise(resolve => { releaseAnalysis = () => resolve(new Response(JSON.stringify({ success: false, error: 'Analysis unavailable in the offline fixture' }), { status: 200 })); })
    : analysisFetch(input, ...args);
await act(async () => { analysisBlock().querySelector('button[aria-label="Оновити розрахунок"]').click(); });
assert.ok(analysisContent().querySelector('[role="status"]'), 'the loading state appears inside the expandable content');
await clickAnalysisToggle();
assert.equal(analysisContent().hidden, true, 'analysis can be collapsed while data is loading');
await act(async () => { releaseAnalysis(); });
globalThis.fetch = analysisFetch;
assert.equal(analysisToggle().getAttribute('aria-expanded'), 'false', 'a completed request must not reopen a collapsed block');
await clickAnalysisToggle();
assert.equal(document.querySelectorAll('.formation-details-chart-area .toolbarRight .hookchart-chart-actions button').length, 2, 'the formation page renders both actions beside the chart settings');
const hookCanvas = document.querySelector('.chartWrap > canvas');
const hookWidth = hookCanvas.width;
await clickPanelToggle(true);
assert.equal(panel().hidden, true);
assert.equal(auth.profile.formationPanelCollapsed, true);
assert.equal(JSON.parse(localStorage.getItem(`signalhook_profile_${account.uid}`)).formationPanelCollapsed, true);
assert.ok(document.querySelector('.chartWrap > canvas') === hookCanvas, 'collapse retains the HookChart instance');
assert.ok(hookCanvas.width > hookWidth, 'HookChart repaints at the full available width');
assert.ok(document.activeElement === panelToggle(false), 'keyboard focus follows the visible restore button');

await act(async () => { await auth.updateProfileData({ defaultChartProvider: 'tradingview' }); await new Promise(resolve => setTimeout(resolve, 100)); });
await act(async () => { for (const observer of Observer.instances) observer.notify(); await new Promise(resolve => setTimeout(resolve, 100)); });
assert.equal(panel().hidden, true, 'both providers share the saved layout');
const tvContainer = document.querySelector('[data-chart-provider="tradingview"]');
assert.equal(analysisToggle().getAttribute('aria-expanded'), 'true', 'TradingView shares the same analysis preference');
await clickAnalysisToggle();
assert.equal(analysisContent().hidden, true, 'smart analysis can be collapsed with TradingView');
assert.equal(auth.profile.smartAnalysisCollapsed, true);
await clickAnalysisToggle();
assert.equal(auth.profile.smartAnalysisCollapsed, false, 'smart analysis can also be expanded with TradingView');
const canvasWidth = container => Math.max(...[...container.querySelectorAll('canvas')].map(canvas => canvas.width));
const tvFullWidth = canvasWidth(tvContainer);
await clickPanelToggle(false);
assert.equal(panel().hidden, false);
assert.equal(auth.profile.formationPanelCollapsed, false, 'expansion is saved too');
assert.ok(document.querySelector('[data-chart-provider="tradingview"]') === tvContainer, 'expansion retains the TradingView instance');
assert.ok(canvasWidth(tvContainer) < tvFullWidth, `TradingView shrinks back to fit the restored panel (${tvFullWidth} -> ${canvasWidth(tvContainer)})`);
await clickPanelToggle(true);
assert.ok(canvasWidth(tvContainer) >= tvFullWidth, 'TradingView expands when its panel is collapsed');
await renderFormation(false);
await renderFormation();
assert.equal(panel().hidden, true, 'closing and reopening restores the profile preference');
assert.equal(analysisContent().hidden, false, 'reopening the page restores the expanded analysis preference');
await act(async () => { await auth.updateProfileData({ defaultChartProvider: 'hookchart' }); await new Promise(resolve => setTimeout(resolve, 100)); });
assert.equal(panel().hidden, true);
await act(async () => {
    document.querySelector('button[title^="Формація:"]').click();
    await new Promise(resolve => setTimeout(resolve, 50));
});
assert.equal(panel().hidden, false, 'the header formation shortcut reveals a collapsed panel');
assert.ok(scrolledElement === document.getElementById('formation-trade-setup-card'));
assert.equal(auth.profile.formationPanelCollapsed, false);
await clickPanelToggle(true);
await act(async () => { await auth.logout(); });
assert.equal(panel().hidden, false, 'signing out does not retain another account layout');
assert.equal(analysisContent().hidden, true, 'signing out resets smart analysis to the collapsed default');
await act(async () => { formationRoot.unmount(); });

const secondAccount = { ...account, uid: 'offline-second-fixture' };
localStorage.setItem('signalhook_local_session', JSON.stringify({ accessToken: 'local.fixture-second', expiresAt: Date.now() + 3600000, user: secondAccount, profile: { ...secondAccount, defaultChartProvider: 'hookchart' } }));
formationRoot = createRoot(document.getElementById('root'));
await renderFormation();
assert.equal(panel().hidden, false, 'another user starts with their own layout');
assert.equal(analysisContent().hidden, true, 'another user starts with their own collapsed analysis');
await clickAnalysisToggle();
assert.equal(JSON.parse(localStorage.getItem(`signalhook_profile_${secondAccount.uid}`)).smartAnalysisCollapsed, false);
await clickAnalysisToggle();
assert.equal(JSON.parse(localStorage.getItem(`signalhook_profile_${secondAccount.uid}`)).smartAnalysisCollapsed, true);
assert.equal(JSON.parse(localStorage.getItem(`signalhook_profile_${account.uid}`)).smartAnalysisCollapsed, false, 'another user cannot overwrite the first account analysis preference');
await clickPanelToggle(true);
await clickPanelToggle(false);
assert.equal(JSON.parse(localStorage.getItem(`signalhook_profile_${secondAccount.uid}`)).formationPanelCollapsed, false);
assert.equal(JSON.parse(localStorage.getItem(`signalhook_profile_${account.uid}`)).formationPanelCollapsed, true, 'another user cannot overwrite the first account preference');
await act(async () => { formationRoot.unmount(); });

localStorage.setItem('signalhook_local_session', JSON.stringify({ accessToken: 'local.fixture-account', expiresAt: Date.now() + 3600000, user: account, profile: JSON.parse(localStorage.getItem(`signalhook_profile_${account.uid}`)) }));
formationRoot = createRoot(document.getElementById('root'));
await renderFormation();
assert.equal(panel().hidden, true, 'a fresh account session restores its saved layout');
assert.equal(analysisContent().hidden, false, 'a fresh account session restores its saved analysis preference');
assert.equal(auth.profile.hookChartPreferences.levelLabelColor, savedLevelAppearance.levelLabelColor, 'marker color survives a fresh account session');
assert.equal(auth.profile.hookChartPreferences.levelLabelSize, 16);
assert.equal(auth.profile.hookChartPreferences.levelLabelStyle, 'filled');
assert.equal(auth.profile.hookChartPreferences.levelLineStyle, 'dash');
assert.deepEqual(auth.profile.hookChartPreferences.levelIntervals, savedLevelAppearance.levelIntervals);
await act(async () => { formationRoot.unmount(); });

const { Chart: AutoLevelChart } = await import('../../src/components/hookchart/engine.tsx');
const levelCandles = candles.map(candle => ({ t: candle.time * 1000, o: candle.open, h: candle.high, l: candle.low, c: candle.close, v: candle.volume, n: 0 }));
const levelRows = [{ id: 'fixture-auto-level', p: 10.4, tf: '1h', kind: 'RESIST', score: 95, firstTime: levelCandles[0].t, confirmedAt: levelCandles[20].t, lastTouch: levelCandles.at(-1).t, visits: 3, zoneLow: 10.38, zoneHigh: 10.42, broken: false, brokenAt: null, strength: 90 }];
const emptyRows = [];
const ignore = () => {};
const levelRoot = createRoot(document.getElementById('root'));
const renderLevel = async appearance => {
    await act(async () => { levelRoot.render(React.createElement(AutoLevelChart, {
        candles: levelCandles, symbol: 'BTCUSDT', tf: '1m', tool: 'cursor', drawings: emptyRows, setDrawings: ignore, alerts: emptyRows, setAlerts: ignore,
        densities: emptyRows, marketPrints: emptyRows, liquidations: emptyRows, autoLevels: levelRows,
        cascadeRisk: { score: 0, level: 'LOW', total5: 0, count5: 0, longUsd: 0, shortUsd: 0 },
        hideTimeJump: true, showLiqRiskBlock: false, levelLabelMode: 'always',
        levelLabelColor: savedLevelAppearance.levelLabelColor, levelLabelSize: savedLevelAppearance.levelLabelSize,
        levelLabelStyle: savedLevelAppearance.levelLabelStyle, levelLineStyle: savedLevelAppearance.levelLineStyle, ...appearance,
    })); await new Promise(resolve => setTimeout(resolve, 50)); });
};
await renderLevel({});
const levelCanvas = document.querySelector('.chartWrap > canvas');
const renderedLevelText = () => canvasTexts.get(levelCanvas).find(item => item.text.endsWith('  1h'));
assert.ok(renderedLevelText().font.includes('16px'), 'saved marker size controls the actual canvas font');
assert.notEqual(renderedLevelText().color, savedLevelAppearance.levelLabelColor, 'filled markers use contrasting text');
assert.equal(renderedLevelText().align, 'left');
assert.equal(renderedLevelText().baseline, 'middle');
const levelBox = canvasFrames.get(levelCanvas).find(fill => fill.color === savedLevelAppearance.levelLabelColor && fill.args[3] === 22);
assert.equal(renderedLevelText().args[1], levelBox.args[1] + levelBox.args[3] / 2, 'price and timeframe are vertically centered inside the colored label');
assert.ok(renderedLevelText().args[0] > levelBox.args[0] && renderedLevelText().args[0] < levelBox.args[0] + levelBox.args[2], 'the text starts inside its box instead of leaving a detached square');
assert.ok(canvasFrames.get(levelCanvas).some(fill => fill.color === savedLevelAppearance.levelLabelColor && fill.args[3] === 22), 'filled marker paints the selected color and size');
assert.ok(canvasStrokes.get(levelCanvas).some(stroke => stroke.kind === 'stroke' && stroke.color === savedLevelAppearance.levelLabelColor && JSON.stringify(stroke.dash) === '[7,5]'), 'selected line type reaches the renderer');
await renderLevel({ levelLabelStyle: 'outline', levelLabelSize: 20, levelLineStyle: 'dot' });
assert.equal(renderedLevelText().color, savedLevelAppearance.levelLabelColor);
assert.ok(renderedLevelText().font.includes('20px'), 'appearance changes redraw without replacing the candle series');
assert.ok(canvasStrokes.get(levelCanvas).some(stroke => stroke.kind === 'strokeRect' && stroke.color === savedLevelAppearance.levelLabelColor));
assert.ok(canvasStrokes.get(levelCanvas).some(stroke => stroke.kind === 'stroke' && JSON.stringify(stroke.dash) === '[2,4]'));
await renderLevel({ levelLabelStyle: 'text', levelLabelColor: '#ff00ff', levelLabelSize: 0.2, levelLineStyle: 'solid' });
assert.equal(renderedLevelText().color, '#ff00ff');
assert.ok(renderedLevelText().font.includes('0.2px'), 'the renderer honors the 0.2px minimum without its old 8px clamp');
assert.equal(canvasStrokes.get(levelCanvas).filter(stroke => stroke.kind === 'strokeRect' && stroke.color === '#ff00ff').length, 0, 'text markers have no box');
const desktopMatchMedia = window.matchMedia;
window.matchMedia = query => ({ ...desktopMatchMedia(query), matches: query === '(pointer: coarse)' });
await renderLevel({ levelLabelSize: 0.2, levelLabelStyle: 'text' });
assert.ok(renderedLevelText().font.includes('10px'), 'phone level captions stay legible even with a saved fractional desktop font size');
assert.ok(renderedLevelText().text.endsWith('  1h'), 'the phone caption includes its source timeframe');
window.matchMedia = desktopMatchMedia;
await renderLevel({ levelLabelMode: 'off' });
assert.equal(renderedLevelText(), undefined, 'the existing visibility preference still hides all marker types');
await renderLevel({ autoLevels: [{ ...levelRows[0], tf: '5m' }] });
assert.ok(canvasTexts.get(levelCanvas).some(label => label.text.endsWith('  5m')), '5m detection results are included in the visible level quota');
const srCandles = Array.from({ length: 80 }, (_, i) => ({ t: 1_700_000_000_000 + i * 60_000, o: 100, c: 100, h: i === 20 ? 110 : 101, l: i === 20 ? 90 : 99, v: 100, n: 0 }));
await renderLevel({ candles: srCandles, autoLevels: emptyRows, autoSR: true, showSRLabels: true });
assert.ok(canvasTexts.get(levelCanvas).some(label => label.text === 'R 1m' && label.color === '#d67a86'));
assert.ok(canvasTexts.get(levelCanvas).some(label => label.text === 'S 1m' && label.color === '#5fb9a8'));
await renderLevel({ candles: srCandles, autoLevels: emptyRows, autoSR: true, showSRLabels: false });
assert.equal(canvasTexts.get(levelCanvas).some(label => label.text === 'R 1m' || label.text === 'S 1m'), false);
assert.ok(canvasStrokes.get(levelCanvas).some(stroke => stroke.color === '#d67a86'), 'hiding S/R labels retains the level lines');
await renderLevel({ candles: srCandles, autoLevels: emptyRows, autoSR: false, showSRLabels: true });
assert.equal(canvasStrokes.get(levelCanvas).some(stroke => stroke.color === '#d67a86' || stroke.color === '#5fb9a8'), false, 'disabling the overlay hides its lines too');
await renderLevel({ autoSR: true, autoLevels: emptyRows, showSRLabels: true, markers: [{ id: 'source-support', type: 'support', label: 'Підтримка', price: 10.4, color: '#a855f7', timeframe: '4h' }] });
assert.ok(canvasTexts.get(levelCanvas).some(label => label.text === 'Підтримка 4h'), 'formation S/R labels retain their source timeframe');
await renderLevel({ autoSR: true, autoLevels: emptyRows, showSRLabels: true, markers: [{ id: 'legacy-support', type: 'support', label: 'Підтримка', price: 10.4, color: '#a855f7' }] });
assert.ok(canvasTexts.get(levelCanvas).some(label => label.text === 'Підтримка 1m'), 'older saved markers fall back to the chart timeframe');
await renderLevel({ autoSR: false, showSRLabels: false, markers: [{ id: 'custom-purple', type: 'custom', label: 'Purple user marker', price: 10.4, color: '#a855f7' }] });
assert.ok(canvasTexts.get(levelCanvas).some(label => label.text === 'Purple user marker'), 'S/R visibility is based on marker type, not color');
await renderLevel({ autoLevels: emptyRows, showLiqRiskBlock: true });
const crosshairPath = () => canvasStrokes.get(levelCanvas).filter(stroke => stroke.color === '#758696').at(-1)?.path;
const movePointer = async (target, x, y) => {
    await act(async () => {
        const event = new window.MouseEvent('pointermove', { bubbles: true });
        Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y } });
        target.dispatchEvent(event);
        await new Promise(resolve => setTimeout(resolve, 50));
    });
};
const cursorBounds = levelCanvas.getBoundingClientRect();
await movePointer(levelCanvas, 503.25, 142.75);
assert.deepEqual(crosshairPath(), [{ kind: 'moveTo', args: [503.25, 0] }, { kind: 'lineTo', args: [503.25, cursorBounds.height] }, { kind: 'moveTo', args: [0, 142.75] }, { kind: 'lineTo', args: [cursorBounds.width, 142.75] }], 'the crosshair follows fractional pointer coordinates without snapping to OHLC');
await movePointer(document.querySelector('.liqRiskContent'), 701.5, 16.25);
assert.equal(crosshairPath()[0].args[0], 701.5, 'hovering chart overlays continues moving the crosshair');
assert.equal(crosshairPath()[2].args[1], 16.25);
await movePointer(levelCanvas, cursorBounds.width - 14.25, 222.5);
assert.equal(crosshairPath()[0].args[0], cursorBounds.width - 14.25, 'the cursor moves through the future area and transparent price-scale overlay');
await movePointer(levelCanvas, -2, -3);
assert.equal(crosshairPath(), undefined, 'captured moves outside the plot do not paint an out-of-bounds cursor');
await act(async () => { levelRoot.unmount(); });
const { terminate } = await import('firebase/firestore');
const { db } = await import('../../src/firebase.ts');
await terminate(db);
dom.window.close();
console.log('PASS: chart controls, provider switching, replay screenshots and concurrent saves work; formation panels and collapsed-by-default smart analysis work with both renderers and persist per account across sessions.');
process.exit(0);

