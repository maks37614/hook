import type { Server } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import type { MarketSentimentData } from '../src/types';
import { calculateMarketSentiment } from './sentimentService';

// Fan out the EXACT same server result used by GET /api/market/sentiment.
// This module opens no exchange sockets or new REST requests per viewer.
export function installMarketSentimentStream(
  server: Server,
  calculate: () => Promise<MarketSentimentData> = () => calculateMarketSentiment(),
  options: { intervalMs?: number; maxClients?: number } = {},
) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  const clients = new Set<WebSocket>();
  const intervalMs = Math.max(50, options.intervalMs ?? 30_000);
  const maxClients = Math.max(1, options.maxClients ?? 512);
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight: Promise<void> | null = null;
  let latestPacket: string | null = null;
  let latestAt = 0;
  let lastAttemptAt = 0;
  let closed = false;
  let computations = 0;
  let errors = 0;

  const send = (ws: WebSocket, packet: string) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 512_000) {
      ws.close(1013, 'Slow sentiment subscriber');
      return;
    }
    try { ws.send(packet); } catch { try { ws.close(); } catch { /* disconnected */ } }
  };
  const broadcast = (packet: string) => {
    for (const ws of clients) send(ws, packet);
  };
  const refresh = (): Promise<void> => {
    if (closed || clients.size === 0) return Promise.resolve();
    if (inFlight) return inFlight;
    lastAttemptAt = Date.now();
    computations++;
    const task = (async () => {
      try {
        const data = await calculate();
        if (closed || clients.size === 0) return;
        latestAt = Date.now();
        latestPacket = JSON.stringify({ type: 'sentiment', at: latestAt, data });
        broadcast(latestPacket);
      } catch {
        errors++;
        if (!closed && clients.size > 0) {
          // Never replace a verified snapshot with made-up or zero values.
          broadcast(JSON.stringify({ type: 'unavailable', at: Date.now() }));
        }
      }
    })();
    inFlight = task;
    void task.finally(() => { if (inFlight === task) inFlight = null; });
    return task;
  };
  const release = (ws: WebSocket) => {
    if (!clients.delete(ws)) return;
    if (clients.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
  server.on('upgrade', (request, socket, head) => {
    if ((request.url || '').split('?')[0] !== '/api/market/sentiment/live') return;
    if (closed) { socket.destroy(); return; }
    // Public market data only. Match the site's existing same-origin WS policy.
    const origin = request.headers.origin;
    if (origin) {
      try {
        const url = new URL(origin);
        if (!/^https?:$/.test(url.protocol) || url.host !== request.headers.host) {
          socket.destroy(); return;
        }
      } catch { socket.destroy(); return; }
    }
    sockets.handleUpgrade(request, socket, head, ws => sockets.emit('connection', ws));
  });
  sockets.on('connection', ws => {
    if (closed || clients.size >= maxClients) {
      ws.close(1013, 'Sentiment subscribers at capacity');
      return;
    }
    clients.add(ws);
    ws.on('message', () => ws.close(1008, 'Read-only sentiment stream'));
    ws.on('close', () => release(ws));
    ws.on('error', () => release(ws));

    if (timer === null) timer = setInterval(() => { void refresh(); }, intervalMs);
    const age = Date.now() - latestAt;
    if (latestPacket !== null && age >= 0 && age < 25_000) {
      send(ws, latestPacket);
    } else if (Date.now() - lastAttemptAt >= 5_000 || lastAttemptAt === 0 || inFlight) {
      void refresh(); // many clients share the same in-flight calculation
    } else {
      send(ws, JSON.stringify({ type: 'unavailable', at: Date.now() }));
    }
  });
  return {
    stats: () => ({ clients: clients.size, activeTimer: timer !== null,
      computations, errors, hasSnapshot: latestPacket !== null }),
    close: () => {
      closed = true;
      if (timer !== null) clearInterval(timer);
      timer = null;
      for (const ws of clients) { try { ws.terminate(); } catch { /* closed */ } }
      clients.clear();
      sockets.close();
    },
  };
}
