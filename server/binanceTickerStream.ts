import WebSocket from 'ws';
import { marketTickerFeed } from './marketTickerFeed';
import { publicPriceFeed, type PublicPriceFeed } from './publicPriceFeed';
import type { MarketType } from '../src/types';

type Source = {
  socket: WebSocket | null;
  retry: ReturnType<typeof setTimeout> | null;
  failures: number;
  lastPacketAt: number;
};

/**
 * Two read-only all-market Binance mini-ticker sockets. Each sends only changed
 * symbols; an initial REST snapshot still establishes the full symbol list.
 * The shared MarketTickerFeed coalesces that bootstrap across every user.
 */
export class BinanceTickerStream {
  private running = false;
  private sources: Record<MarketType, Source> = {
    spot: { socket: null, retry: null, failures: 0, lastPacketAt: 0 },
    futures: { socket: null, retry: null, failures: 0, lastPacketAt: 0 },
  };

  constructor(private readonly createSocket: (url: string) => WebSocket =
    url => new WebSocket(url, { handshakeTimeout: 10_000, perMessageDeflate: false }),
    private readonly enabled = process.env.H00K_OFFLINE_TESTS !== '1',
    private readonly alertPrices: Pick<PublicPriceFeed, 'setBinanceConnection' | 'ingestBinanceTicks'> = publicPriceFeed) {}

  start() {
    if (this.running) return;
    this.running = true;
    if (!this.enabled || process.env.H00K_BINANCE_TICKER_WS === '0') return;
    this.connect('spot');
    this.connect('futures');
  }

  private connect(market: MarketType) {
    const state = this.sources[market];
    if (!this.running || state.retry || state.socket) return;
    const url = market === 'spot'
      ? 'wss://stream.binance.com:9443/ws/!miniTicker@arr'
      : 'wss://fstream.binance.com/market/ws/!miniTicker@arr';
    let socket: WebSocket;
    try { socket = this.createSocket(url); }
    catch { this.schedule(market); return; }
    state.socket = socket;
    socket.on('open', () => {
      if (state.socket !== socket) return;
      state.failures = 0;
      this.alertPrices.setBinanceConnection(market, true);
    });
    socket.on('message', raw => {
      if (state.socket !== socket) return;
      let ticks: unknown;
      try { ticks = JSON.parse(raw.toString()); }
      catch { return; }
      if (!Array.isArray(ticks)) return;
      state.lastPacketAt = Date.now();
      marketTickerFeed.applyBinanceMiniTickers(market, ticks);
      this.alertPrices.ingestBinanceTicks(market, ticks);
    });
    socket.on('error', () => {
      if (state.socket === socket && socket.readyState === WebSocket.OPEN) {
        try { socket.close(); } catch {}
      }
    });
    socket.on('close', () => {
      if (state.socket !== socket) return;
      state.socket = null;
      this.alertPrices.setBinanceConnection(market, false);
      if (this.running) this.schedule(market);
    });
  }

  private schedule(market: MarketType) {
    const state = this.sources[market];
    if (!this.running || state.retry) return;
    const delay = Math.min(30_000, 1_000 * (2 ** Math.min(state.failures++, 5)));
    state.retry = setTimeout(() => {
      state.retry = null;
      this.connect(market);
    }, delay + Math.floor(Math.random() * 300));
    state.retry.unref?.();
  }

  status() {
    return (['spot', 'futures'] as const).map(market => ({
      market, connected: this.sources[market].socket?.readyState === WebSocket.OPEN,
      lastPacketAt: this.sources[market].lastPacketAt,
      reconnects: this.sources[market].failures,
    }));
  }

  stop() {
    this.running = false;
    for (const market of ['spot', 'futures'] as const) {
      const state = this.sources[market];
      if (state.retry) clearTimeout(state.retry);
      state.retry = null;
      this.alertPrices.setBinanceConnection(market, false);
      if (state.socket) {
        const socket = state.socket;
        state.socket = null;
        try {
          if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
          else socket.close();
        } catch {}
      }
    }
  }
}

export const binanceTickerStream = new BinanceTickerStream();
