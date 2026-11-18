import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TERMINAL_LINK_SETTINGS,
  getUserTerminalLinkSettings, normalizeMetaScalpGroup, normalizeTigerGroup,
  normalizeTerminalLinkSettings, sendToSelectedTerminal, testTigerConnection, matchesTigerAcknowledgement, isFreshTerminalNotification, tigerExchangeCode,
} from '../src/utils/terminalLinkService';
import { DEFAULT_METASCALP_SETTINGS } from '../src/utils/metaScalpService';

test('terminal preferences are isolated per user and legacy MetaScalp settings are preserved', () => {
  const previous = { uid: 'owner-a', metaScalpSettings: { ...DEFAULT_METASCALP_SETTINGS, autoSwitchOnClick: false } };
  assert.equal(getUserTerminalLinkSettings('owner-a', previous).switchOnChartOpen, false);
  assert.equal(getUserTerminalLinkSettings('owner-b', previous).provider, 'none');
  assert.equal(getUserTerminalLinkSettings(undefined, previous).enabled, false);
  assert.equal(getUserTerminalLinkSettings('owner-a', previous).provider, 'metascalp');
});

test('terminal settings normalize corrupt or incomplete persisted objects', () => {
  const p = normalizeTerminalLinkSettings({
    provider: 'untrusted' as any, tigerPort: -3, tigerGroup: 'AX',
    minQuality: 155, cooldownMs: -1,
    sources: { screener: false, formations: true } as any,
    tigerGroups: { screener: 'AX', formations: '11' },
    metaScalpGroups: { screener: '000', formations: '12' },
  });
  assert.equal(p.provider, 'metascalp');
  assert.equal(p.tigerPort, 7819);
  assert.equal(p.tigerGroup, 'A');
  assert.equal(p.minQuality, 100);
  assert.equal(p.cooldownMs, 0);
  assert.equal(p.sources.screener, false);
  assert.equal(p.sources.favorites, true);
  assert.deepEqual(p.tigerGroups, { formations: '11' });
  assert.deepEqual(p.metaScalpGroups, { formations: '012' });
  assert.equal(p.autoSignals, false);
  assert.equal(normalizeMetaScalpGroup('500'), '500');
  assert.equal(normalizeMetaScalpGroup('0'), null);
  assert.equal(normalizeTigerGroup('z'), 'Z');
  assert.equal(normalizeTigerGroup('12'), '12');
  assert.equal(normalizeTigerGroup('18'), '18');
  assert.equal(normalizeTigerGroup('19'), null);
  assert.equal(tigerExchangeCode('binance', 'futures'), 'BINANCE-FUT');
  assert.equal(tigerExchangeCode('binance', 'spot'), 'BINANCE');
  assert.equal(tigerExchangeCode('bybit', 'futures'), 'BYBIT');
});

test('permissions prevent all terminal commands, including alerts disabled by default', async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    calls.push(String(input)); return new Response('{}');
  });
  const disabled = await sendToSelectedTerminal('BTCUSDT', 'binance', 'futures', 'alerts',
    DEFAULT_TERMINAL_LINK_SETTINGS, DEFAULT_METASCALP_SETTINGS);
  assert.equal(disabled.success, false);
  assert.match(disabled.message, /вимкнено/);
  const quality = await sendToSelectedTerminal('BTCUSDT', 'binance', 'futures', 'formations',
    { ...DEFAULT_TERMINAL_LINK_SETTINGS, minQuality: 80 },
    DEFAULT_METASCALP_SETTINGS, 60);
  assert.equal(quality.success, false);
  assert.equal(calls.length, 0);
});

test('MetaScalp selected path sends only valid binding and never sends orders', async (t) => {
  const sent: Array<{ path: string; payload: unknown }> = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, options: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.pathname === '/ping') return new Response(JSON.stringify({ app: 'MetaScalp' }), { status: 200 });
    sent.push({ path: url.pathname, payload: JSON.parse(String(options.body)) });
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
  });
  const p = normalizeTerminalLinkSettings({ metaScalpGroups: { formations: '050' } });
  const result = await sendToSelectedTerminal('ETHUSDT', 'bybit', 'futures', 'formations', p, DEFAULT_METASCALP_SETTINGS, 95);
  assert.equal(result.success, true);
  assert.equal(result.terminal, 'metascalp');
  assert.deepEqual(sent, [{ path: '/api/change-ticker', payload: { tickerPattern: 'BYBIT:ETHUSDT.p', binding: '050' } }]);
});

test('Tiger acknowledges a correctly formatted setLinkSymbol command', async (t) => {
  const commands: unknown[] = [];
  class FakeWebSocket {
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    constructor(readonly url: string) { queueMicrotask(() => this.onopen?.()); }
    send(raw: string) {
      if (raw === 'ping') { queueMicrotask(() => this.onmessage?.({ data: 'pong' })); return; }
      const request = JSON.parse(raw);
      commands.push(request);
      queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({
        response: { type: 'successfully' },
        request: { ...request, type: 'SetLinkSymbol', m: request.m === 'FUTURES' ? 'Futures' : 'Spot' },
        message: 'Symbol linked successfully.',
      }) }));
    }
    close() {}
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  Object.defineProperty(globalThis, 'WebSocket', { value: FakeWebSocket, configurable: true, writable: true });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'WebSocket', previous);
    else Reflect.deleteProperty(globalThis, 'WebSocket');
  });
  const settings = normalizeTerminalLinkSettings({ provider: 'tiger', tigerPort: 7819, tigerGroup: 'A', tigerGroups: { formations: 'B' } });
  const result = await sendToSelectedTerminal('btcusdt', 'binance', 'futures', 'formations', settings, DEFAULT_METASCALP_SETTINGS, 90);
  assert.equal(result.success, true);
  assert.equal(result.group, 'B');
  assert.deepEqual(commands, [{ type: 'setLinkSymbol', e: 'BINANCE-FUT', m: 'FUTURES', symbol: 'BTCUSDT', linkGroup: 'B' }]);
  const bybitResult = await sendToSelectedTerminal('ETHUSDT', 'bybit', 'futures', 'formations', settings, DEFAULT_METASCALP_SETTINGS, 90);
  assert.equal(bybitResult.success, true);
  assert.deepEqual(commands[1], { type: 'setLinkSymbol', e: 'BYBIT', m: 'FUTURES', symbol: 'ETHUSDT', linkGroup: 'B' });
  const spotResult = await sendToSelectedTerminal('BTCUSDT', 'binance', 'spot', 'formations', settings, DEFAULT_METASCALP_SETTINGS, 90);
  assert.equal(spotResult.success, true);
  assert.deepEqual(commands[2], { type: 'setLinkSymbol', e: 'BINANCE', m: 'SPOT', symbol: 'BTCUSDT', linkGroup: 'B' });
  assert.equal((await testTigerConnection(7819)).ok, true);
});

test('paused Vataga selection fails closed without activating a fallback provider', async () => {
  const saved = normalizeTerminalLinkSettings({ provider: 'vataga', enabled: true, autoSignals: true });
  assert.equal(saved.provider, 'none');
  assert.equal(saved.enabled, false);
  assert.equal(saved.autoSignals, false);
  const result = await sendToSelectedTerminal('SOLUSDT', 'bybit', 'spot', 'screener',
    saved, DEFAULT_METASCALP_SETTINGS);
  assert.equal(result.success, false);
  assert.equal(result.terminal, 'none');
  assert.equal(result.copiedToClipboard, undefined);
  assert.match(result.message, /вимкнена/);
  const restored = getUserTerminalLinkSettings('owner-a', {
    uid: 'owner-a', terminalLinkSettings: { ...DEFAULT_TERMINAL_LINK_SETTINGS, provider: 'vataga' },
  });
  assert.equal(restored.provider, 'none');
  assert.equal(restored.enabled, false);
});

test('Tiger accepts only acknowledgement of the exact requested symbol and group', () => {
  const request = JSON.stringify({ type: 'setLinkSymbol', e: 'BINANCE', m: 'FUTURES', symbol: 'BTCUSDT', linkGroup: 'B' });
  const ack = { response: { type: 'successfully' },
    request: { type: 'SetLinkSymbol', e: 'BINANCE', m: 'Futures', symbol: 'BTCUSDT', linkGroup: 'B' } };
  assert.equal(matchesTigerAcknowledgement(request, ack), true);
  assert.equal(matchesTigerAcknowledgement(request, { response: { type: 'successfully' } }), false);
  assert.equal(matchesTigerAcknowledgement(request, {
    ...ack, request: { ...ack.request, symbol: 'ETHUSDT' },
  }), false);
  assert.equal(matchesTigerAcknowledgement(request, {
    ...ack, request: { ...ack.request, linkGroup: 'A' },
  }), false);
  assert.equal(matchesTigerAcknowledgement(request, { response: { type: 'error' }, request: ack.request }), false);
  assert.equal(matchesTigerAcknowledgement('ping', ack), false);
});

test('Tiger ping must be a real pong, not an unrelated success response', async (t) => {
  class FakeWebSocket {
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    constructor() { queueMicrotask(() => this.onopen?.()); }
    send(_payload: string) {
      queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({
        response: { type: 'successfully' }, message: 'Not a Pong',
      }) }));
      queueMicrotask(() => this.onmessage?.({ data: 'pong' }));
    }
    close() {}
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  Object.defineProperty(globalThis, 'WebSocket', { value: FakeWebSocket, configurable: true, writable: true });
  t.after(() => previous
    ? Object.defineProperty(globalThis, 'WebSocket', previous)
    : Reflect.deleteProperty(globalThis, 'WebSocket'));
  assert.equal((await testTigerConnection(7819)).ok, true);
});

test('automatic linking accepts only new, recent, nonfuture notifications', () => {
  const now = 100_000;
  assert.equal(isFreshTerminalNotification(now - 2000, now - 3000, now), true);
  assert.equal(isFreshTerminalNotification(now - 2000, now - 1000, now), false, 'loaded history predates opt-in');
  assert.equal(isFreshTerminalNotification(now - 20000, now - 30000, now), false, 'stale');
  assert.equal(isFreshTerminalNotification(now + 2000, now - 3000, now), false, 'future');
  assert.equal(isFreshTerminalNotification(NaN, now - 3000, now), false);
});

test('background terminal signals never overwrite the clipboard if providers are unavailable', async (t) => {
  const copied: string[] = [];
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: { clipboard: { writeText: async (value: string) => { copied.push(value); } } },
  });
  t.after(() => {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  });
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 404 }));
  const allSources = { ...DEFAULT_TERMINAL_LINK_SETTINGS.sources, alerts: true };
  const meta = await sendToSelectedTerminal('BTCUSDT', 'binance', 'futures', 'alerts',
    normalizeTerminalLinkSettings({ sources: allSources }), DEFAULT_METASCALP_SETTINGS, undefined, false);
  assert.equal(meta.success, false);
  assert.equal(meta.copiedToClipboard, false);
  const vataga = await sendToSelectedTerminal('SOLUSDT', 'bybit', 'spot', 'alerts',
    normalizeTerminalLinkSettings({ provider: 'vataga', sources: allSources }), DEFAULT_METASCALP_SETTINGS, undefined, false);
  assert.equal(vataga.success, false);
  assert.notEqual(vataga.copiedToClipboard, true);
  assert.deepEqual(copied, []);
});
