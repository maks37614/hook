import type { Express } from 'express';
import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { publicMarketUrl, publicStreamUrl } from '../src/utils/exchangeEndpoints';
import { exchangeFetch, exchangeGatewayStatus } from './exchangeGateway';
import { exchangeStreamPool, type SharedExchangeSocket } from './exchangeStreamPool';
import { verifyUserToken } from './authService';

export function installMarketRoutes(app: Express) {
  const clients = new Map<string, { reset: number; count: number }>();
  app.get('/api/market/source', async (req, res) => {
    const uid = res.locals.userId, now = Date.now();
    for (const [id, entry] of clients) if (entry.reset <= now) clients.delete(id);
    const usage = clients.get(uid) || { reset: now + 10_000, count: 0 }; clients.set(uid, usage);
    if (++usage.count > 120) return void res.status(429).json({ error: 'Забагато запитів. Повторіть через кілька секунд.' });
    const url = typeof req.query.url === 'string' ? publicMarketUrl(req.query.url) : null;
    if (!url) return void res.status(400).json({ error: 'Дозволені лише публічні ринкові дані Binance або Bybit' });
    try {
      const response = await exchangeFetch(url, { signal: AbortSignal.timeout(12_000) });
      const body = Buffer.from(await response.arrayBuffer());
      res.status(response.status).set('Cache-Control', 'no-store').type('application/json');
      for (const name of ['retry-after', 'x-hook2-source-updated-at']) {
        const value = response.headers.get(name); if (value) res.set(name, value);
      }
      res.send(body);
    } catch { res.status(503).json({ error: 'Ринкове джерело тимчасово недоступне. Дані не підміняються.' }); }
  });
  app.get('/api/market/connection-status', (_req, res) => res.set('Cache-Control', 'no-store').json({ sources: exchangeGatewayStatus(), streams: exchangeStreamPool.stats() }));
}

export function installMarketStreams(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16_384 });
  const counts = new Map<string, number>();
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/api/market/stream') { if (process.env.NODE_ENV === 'production') socket.destroy(); return; }
    const source = url.searchParams.get('source');
    if (!source || !publicStreamUrl(source) || wss.clients.size >= 1024) { socket.write('HTTP/1.1 400 Bad Request\r\n\r\n'); socket.destroy(); return; }
    if (req.headers.origin) {
      let origin: URL; try { origin = new URL(req.headers.origin); } catch { socket.destroy(); return; }
      if (origin.host !== req.headers.host) { socket.destroy(); return; }
    }
    wss.handleUpgrade(req, socket, head, client => {
      let upstream: SharedExchangeSocket | undefined, uid: string | undefined, token = '', authenticating = false;
      let windowStart = Date.now(), messages = 0;
      const timeout = setTimeout(() => client.close(4001, 'Потрібен вхід'), 10_000);
      const sessionCheck = setInterval(() => {
        if (!uid) return;
        void verifyUserToken(token).then(current => { if (current !== uid) client.close(4001, 'Сесія завершилася'); }).catch(() => client.close(4001, 'Сесія завершилася'));
      }, 60_000); sessionCheck.unref?.();
      client.on('message', async raw => {
        if (Date.now() - windowStart > 1000) { windowStart = Date.now(); messages = 0; }
        if (++messages > 20) return void client.close(1008, 'Забагато повідомлень');
        try {
          if (!uid) {
            if (authenticating) return;
            authenticating = true;
            const auth = JSON.parse(raw.toString());
            if (auth.type !== 'auth' || typeof auth.token !== 'string' || auth.token.length > 10000) throw new Error('Invalid authentication');
            token = auth.token; const account = await verifyUserToken(token);
            if (client.readyState !== WebSocket.OPEN) return;
            if ((counts.get(account) || 0) >= 32) return void client.close(1013, 'Забагато відкритих графіків');
            uid = account; counts.set(uid, (counts.get(uid) || 0) + 1); clearTimeout(timeout);
            upstream = exchangeStreamPool.open(source);
            upstream.on('open', () => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'hook2.ready' })); });
            upstream.on('message', data => {
              if (client.readyState !== WebSocket.OPEN) return;
              if (client.bufferedAmount > 2 * 1024 * 1024) return void client.close(1013, 'Повільне з’єднання. Перепідключення');
              client.send(data.toString());
            });
            upstream.on('close', () => client.close(1012, 'Перепідключення до джерела'));
          } else upstream?.send(raw.toString());
        } catch { client.close(uid ? 1013 : 4001, uid ? 'Джерело тимчасово недоступне' : 'Сесія недійсна'); }
      });
      client.on('error', () => {});
      client.on('close', () => {
        clearTimeout(timeout); clearInterval(sessionCheck);
        if (uid) { const count = (counts.get(uid) || 1) - 1; if (count) counts.set(uid, count); else counts.delete(uid); }
        upstream?.close(); upstream?.removeAllListeners();
      });
    });
  });
  return () => { for (const client of wss.clients) client.close(1001, 'Сервер перезапускається'); wss.close(); exchangeStreamPool.stop(); };
}
