import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchMarketTradeSeedJson } from '../src/components/hookchart/marketTradeSeed';
import { subscribeMarketTrades } from '../src/components/hookchart/marketTradeStream';

type FeedEvent = { data: string };

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  onmessage: ((event: FeedEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = FakeWebSocket.OPEN;
  constructor(readonly url: string) { FakeWebSocket.instances.push(this); }
  close() { this.readyState = 3; this.onclose?.(); }
  send(_payload: string) {}
  emit(id: number) {
    this.onmessage?.({ data: JSON.stringify({
      a: id, T: Date.now(), p: '105', q: '3', m: false,
    }) });
  }
}

test('trade seed deadline releases stalled headers and stalled response JSON', async () => {
  const originalFetch = globalThis.fetch;
  let aborts = 0;
  try {
    globalThis.fetch = (_url, options) => new Promise<Response>(() => {
      (options?.signal as AbortSignal).addEventListener('abort', () => { aborts++; }, { once: true });
    });
    await assert.rejects(fetchMarketTradeSeedJson('https://example.invalid/stuck', new AbortController().signal, 12),
      /timed out/);
    assert.equal(aborts, 1, 'deadline must abort the underlying REST attempt');

    globalThis.fetch = async () => ({
      ok: true,
      json: () => new Promise<never>(() => {}),
    } as unknown as Response);
    await assert.rejects(fetchMarketTradeSeedJson('https://example.invalid/stalled-json', new AbortController().signal, 12),
      /timed out/, 'deadline must also cover reading the response body');
  } finally { globalThis.fetch = originalFetch; }
});

test('trade seed respects cancellation when chart unmounts', async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  try {
    globalThis.fetch = (_url, options) => new Promise<Response>((_resolve, reject) => {
      const signal = options?.signal as AbortSignal;
      if (signal.aborted) reject(new Error('stopped'));
      else signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true });
    });
    const pending = fetchMarketTradeSeedJson('https://example.invalid/stopped', controller.signal, 10_000);
    controller.abort();
    await assert.rejects(pending);
  } finally { globalThis.fetch = originalFetch; }
});

test('failed REST seed releases buffered WebSocket executions without needing twenty thousand trades', async () => {
  const originalFetch = globalThis.fetch;
  const originalWS = globalThis.WebSocket;
  FakeWebSocket.instances = [];
  const received: string[] = [];
  let stop: (() => void) | null = null;
  try {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    globalThis.fetch = () => new Promise<Response>((_resolve, reject) => {
      setTimeout(() => reject(new Error('temporary REST outage')), 20);
    });
    stop = subscribeMarketTrades(
      { exchange: 'binance', marketType: 'futures', symbol: 'SEEDFAILUSDT' },
      { onTrade: row => received.push(row.id), onPrints: () => {} },
    );
    assert.equal(FakeWebSocket.instances.length, 1);
    FakeWebSocket.instances[0].emit(443001);
    assert.deepEqual(received, [], 'feed must sequence REST and WS before seed finishes');
    await new Promise(resolve => setTimeout(resolve, 55));
    assert.deepEqual(received, ['443001'], 'REST outage must not hide live executions indefinitely');
    FakeWebSocket.instances[0].emit(443002);
    assert.deepEqual(received, ['443001', '443002'], 'live feed continues directly after seed release');
  } finally {
    stop?.();
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWS;
  }
});
