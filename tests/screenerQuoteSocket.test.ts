import assert from 'node:assert/strict';
import test from 'node:test';
import { createScreenerQuoteSocket } from '../src/utils/screenerQuoteSocket';

test('Screener WS applies only subscribed markets and drops old buffered data after filter changes', async () => {
  const oldWindow = (globalThis as any).window;
  const oldDocument = (globalThis as any).document;
  const oldWebSocket = (globalThis as any).WebSocket;
  const listeners = new Map<string, (event: unknown) => void>();
  class FakeSocket {
    static OPEN = 1;
    readyState = 0;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    messages: string[] = [];
    send(value: string) { this.messages.push(value); }
    close() { this.readyState = 3; }
    open() { this.readyState = 1; this.onopen?.(); }
    receive(rows: unknown[]) {
      this.onmessage?.({ data: JSON.stringify({ type: 'quotes', at: Date.now(), rows }) });
    }
  }
  const socket = new FakeSocket();
  const seen: string[] = [];
  (globalThis as any).window = { location: { href: 'https://h00k.top/#screener' } };
  (globalThis as any).document = {
    hidden: false,
    addEventListener: (event: string, callback: (data: unknown) => void) => listeners.set(event, callback),
    removeEventListener: (event: string) => listeners.delete(event),
  };
  (globalThis as any).WebSocket = FakeSocket;
  const handle = createScreenerQuoteSocket(rows => seen.push(...rows.map(row => row.symbol)),
    () => socket as unknown as WebSocket);
  const scope = (symbol: string) => ({ exchange: 'binance' as const,
    marketType: 'futures' as const, symbol });
  const quote = (symbol: string, price: number) => ({
    ...scope(symbol), price, change24h: 1, volumeUsd: 1000,
    high24h: 120, low24h: 80,
  });
  try {
    handle.start();
    handle.updateScopes([scope('BTCUSDT')]);
    socket.open();
    socket.receive([quote('BTCUSDT', 100)]);
    handle.updateScopes([scope('ETHUSDT')]);
    socket.receive([quote('ETHUSDT', 110)]);
    await new Promise(resolve => setTimeout(resolve, 550));
    assert.deepEqual(seen, ['ETHUSDT']);
    assert.equal(socket.messages.length, 2,
      'changed filter sends only two WS subscriptions instead of a new connection');
    handle.stop();
    assert.equal(listeners.size, 0, 'visibility listener must be released');
  } finally {
    handle.stop();
    (globalThis as any).window = oldWindow;
    (globalThis as any).document = oldDocument;
    (globalThis as any).WebSocket = oldWebSocket;
  }
});
