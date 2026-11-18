import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { ExchangeId, MarketType } from '../../src/types';
import { OrderBookStatus } from './types';
import { BinanceOrderBookSync, binanceStreamUrls } from '../../src/utils/binanceOrderBook';
import { fetchOrderBook } from '../marketService';
import { normalizeExchangeSymbol } from '../../src/utils/marketSymbols';
import { isFreshDepthTime } from '../../src/utils/orderBookValidation';
import { BybitOrderBookSync } from './bybitOrderBook';

export interface RawTradeEvent {
  id?: string;
  price: number;
  quantity: number;
  side: 'BUY' | 'SELL';
  time: number;
  isBuyerMaker: boolean;
}

export interface RawDepthDelta {
  bids: [number, number][]; // [price, qty]
  asks: [number, number][];
  isSnapshot?: boolean;
  sequence?: number;
  eventTime?: number;
}

interface StreamDependencies {
  createWebSocket?: (url: string, options: { handshakeTimeout: number }) => WebSocket;
  fetchBook?: typeof fetchOrderBook;
}

export class ExchangeStreamClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private isDestroyed = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;

  private reconnectAttempts = 0;
  private readonly backoffSchedule = [1000, 2000, 5000, 10000, 30000, 60000];

  private bybitTicker: Record<string, any> = {};
  /** Reject older-but-still-fresh ticker frames after a newer price/OI
   * sample. Reset on each WebSocket connection generation. */
  private lastBybitTickerEventTime = 0;
  private additionalSockets: WebSocket[] = [];
  private binanceBook: BinanceOrderBookSync;
  private bybitBook: BybitOrderBookSync;
  private snapshotInFlight = false;
  private snapshotRetry: NodeJS.Timeout | null = null;
  private snapshotRetryDelayMs = 3_000;
  private generation = 0;
  private lastDepthReceivedAt = 0;
  private connectionStartedAt = 0;

  public status: OrderBookStatus = 'CONNECTING';
  public lastDataReceivedAt = 0;

  constructor(
    public readonly symbol: string,
    public readonly exchange: ExchangeId,
    public readonly marketType: MarketType,
    private readonly depthOnly = false,
    private readonly dependencies: StreamDependencies = {},
  ) {
    super();
    this.binanceBook = new BinanceOrderBookSync(marketType, update => {
      this.lastDepthReceivedAt = Date.now();
      this.setStatus('LIVE');
      this.emit('depth', update);
    }, () => {
      this.requestBookResync();
    });
    this.bybitBook = new BybitOrderBookSync(symbol, update => {
      this.lastDepthReceivedAt = Date.now();
      this.setStatus('LIVE');
      this.emit('depth', update);
    }, () => this.requestBookResync());
    this.connect();
    this.startWatchdog();
  }

  private cleanSymbol(): string {
    return normalizeExchangeSymbol(this.symbol);
  }

  private getWebSocketUrl(): string {
    const sym = this.cleanSymbol();
    if (this.exchange === 'binance') {
      return binanceStreamUrls(sym, this.marketType)[0];
    } else {
      // Bybit
      if (this.marketType === 'futures') {
        return 'wss://stream.bybit.com/v5/public/linear';
      } else {
        return 'wss://stream.bybit.com/v5/public/spot';
      }
    }
  }

  private setStatus(newStatus: OrderBookStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.emit('status', newStatus);
    }
  }

  public connect() {
    if (this.isDestroyed) return;
    this.cleanupSocket();
    this.generation++;
    const generation = this.generation;
    this.snapshotInFlight = false;
    this.snapshotRetryDelayMs = 3_000;
    this.binanceBook.reset();
    this.bybitBook.reset();
    this.lastBybitTickerEventTime = 0;
    this.lastDepthReceivedAt = 0;
    this.connectionStartedAt = Date.now();

    const urls = this.exchange === 'binance' ? binanceStreamUrls(this.symbol, this.marketType) : [this.getWebSocketUrl()];
    this.setStatus('CONNECTING');

    try {
      for (const [index, url] of (this.depthOnly ? urls.slice(0, 1) : urls).entries()) {
        const socket = this.dependencies.createWebSocket
          ? this.dependencies.createWebSocket(url, { handshakeTimeout: 10000 })
          : new WebSocket(url, { handshakeTimeout: 10000 });
        if (index === 0) this.ws = socket;
        else this.additionalSockets.push(socket);

        socket.on('open', () => {
          if (this.isDestroyed || generation !== this.generation) return;
          this.reconnectAttempts = 0;
          if (index === 0) this.setStatus('SYNCING');
          this.lastDataReceivedAt = Date.now();
          this.bybitTicker = {};
          this.lastBybitTickerEventTime = 0;

          // If Bybit, send subscription payload and start ping interval
          if (this.exchange === 'bybit') {
            const sym = this.cleanSymbol();
            const subscribeMsg = {
              op: 'subscribe',
              args: this.depthOnly ? [`orderbook.1000.${sym}`] : [`tickers.${sym}`, `publicTrade.${sym}`, `orderbook.1000.${sym}`],
            };
            this.ws?.send(JSON.stringify(subscribeMsg));

            // Bybit heartbeat ping every 20 seconds
            this.pingInterval = setInterval(() => {
              if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ op: 'ping' }));
              }
            }, 20000);
          }
          if (this.exchange === 'binance' && index === 0) void this.loadBinanceSnapshot();
        });

        socket.on('message', (data: WebSocket.Data) => {
          if (this.isDestroyed || generation !== this.generation) return;
          this.lastDataReceivedAt = Date.now();
          try {
            const str = data.toString();
            const json = JSON.parse(str);
            this.handleIncomingMessage(json);
          } catch (e) {
            // invalid json ignore
          }
        });

        socket.on('error', (err) => {
          if (this.isDestroyed || generation !== this.generation) return;
          this.setStatus('ERROR');
          this.emit('error', err);
        });

        socket.on('close', (code, reason) => {
          if (this.isDestroyed || generation !== this.generation) return;
          this.setStatus('STALE');
          this.scheduleReconnect();
        });
      }
    } catch (e) {
      this.setStatus('ERROR');
      this.scheduleReconnect();
    }
  }

  private async loadBinanceSnapshot() {
    if (this.isDestroyed || this.snapshotInFlight) return;
    this.snapshotInFlight = true;
    const generation = this.generation;
    try {
      const snapshot = await (this.dependencies.fetchBook || fetchOrderBook)('binance', this.marketType, this.symbol, 1000);
      if (this.isDestroyed || generation !== this.generation) return;
      if (snapshot.lastUpdateId && snapshot.bids.length && snapshot.asks.length) {
        this.binanceBook.setSnapshot({ bids: snapshot.bids, asks: snapshot.asks, sequence: snapshot.lastUpdateId, eventTime: snapshot.timestamp });
        if (!this.binanceBook.needsSnapshot) this.snapshotRetryDelayMs = 3_000;
      } else this.setStatus('ERROR');
    } catch (error) {
      if (!this.isDestroyed && generation === this.generation) {
        this.setStatus('ERROR');
        this.emit('error', error);
      }
    } finally {
      if (generation === this.generation) {
        this.snapshotInFlight = false;
        if (!this.isDestroyed && this.binanceBook.needsSnapshot && !this.snapshotRetry) {
          // A denied/empty REST snapshot must not provoke a 3-second retry storm.
          const delay = this.snapshotRetryDelayMs;
          this.snapshotRetryDelayMs = Math.min(30_000, delay * 2);
          this.snapshotRetry = setTimeout(() => { this.snapshotRetry = null; void this.loadBinanceSnapshot(); }, delay);
        }
      }
    }
  }

  private handleIncomingMessage(msg: any) {
    if (this.exchange === 'binance') {
      this.handleBinanceMessage(msg.data ?? msg);
    } else {
      this.handleBybitMessage(msg);
    }
  }

  private handleBinanceMessage(msg: any) {
    const eventType = msg.e;
    if (msg.s && normalizeExchangeSymbol(msg.s) !== this.cleanSymbol()) return;

    // Ticker stream (24hr ticker)
    if (eventType === '24hrTicker' || (msg.s && msg.c !== undefined)) {
      const price = parseFloat(msg.c);
      const high24h = parseFloat(msg.h || 0);
      const low24h = parseFloat(msg.l || 0);
      const volume24hUsd = parseFloat(msg.q || 0);
      // Binance event clock must be genuine and recent: a delayed ticker
      // cannot revive a stale quote after an exchange/network interruption.
      if (Number.isFinite(price) && price > 0 && isFreshDepthTime(msg.E)) {
        this.emit('price', {
          price,
          high24h,
          low24h,
          volume24hUsd,
          change24h: Number(msg.P || 0),
          time: msg.E || Date.now(),
        });
      }
    }

    // Trade stream (trade or aggTrade)
    if (eventType === 'trade' || eventType === 'aggTrade') {
      const price = parseFloat(msg.p);
      const quantity = parseFloat(msg.q);
      const isBuyerMaker = Boolean(msg.m);
      // If buyer is maker, taker is seller -> aggressive SELL. If buyer is taker -> aggressive BUY.
      const side: 'BUY' | 'SELL' = isBuyerMaker ? 'SELL' : 'BUY';

      if (Number.isFinite(price) && price > 0 && Number.isFinite(quantity) && quantity > 0 &&
          isFreshDepthTime(msg.T ?? msg.E)) {
        const tradeEvent: RawTradeEvent = {
          price,
          quantity,
          side,
          time: msg.T || msg.E || Date.now(),
          isBuyerMaker,
        };
        this.emit('trade', tradeEvent);
      }
    }

    if (eventType === 'depthUpdate' && this.binanceBook) {
      if (msg.s !== this.cleanSymbol() || !isFreshDepthTime(msg.E)) {
        this.resyncOrderBook();
        return;
      }
      this.binanceBook.push(msg);
    }
  }

  private handleBybitMessage(msg: any) {
    if (msg.op === 'subscribe' && msg.success === false) {
      this.setStatus('ERROR');
      this.scheduleReconnect();
      return;
    }
    if (msg.op === 'pong' || msg.ret_msg === 'pong') {
      return;
    }

    const topic = typeof msg.topic === 'string' ? msg.topic : '';
    const symbol = this.cleanSymbol();
    // A socket is subscribed to one symbol. Ignore unrelated, delayed or
    // malformed market messages rather than cross-contaminating a worker.
    const eventTime = Number(msg.ts);
    const freshEvent = Number.isFinite(eventTime) && isFreshDepthTime(eventTime);

    // Tickers
    if (topic === `tickers.${symbol}` && freshEvent) {
      // A delayed frame can still be within the 5-second freshness window.
      // Never move the quote or OI backwards after newer data was observed.
      if (eventTime < this.lastBybitTickerEventTime) return;
      const incoming = Array.isArray(msg.data) ? msg.data[0] : msg.data;
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming) ||
          (incoming.symbol !== undefined && normalizeExchangeSymbol(incoming.symbol) !== symbol))
        return;
      this.lastBybitTickerEventTime = eventTime;
      if (msg.type === 'snapshot') this.bybitTicker = {};
      Object.assign(this.bybitTicker, incoming);
      const data = this.bybitTicker;
      if (data) {
        const lastPrice = parseFloat(data.lastPrice);
        const high24h = parseFloat(data.highPrice24h || 0);
        const low24h = parseFloat(data.lowPrice24h || 0);
        // Bybit sends 24h turnover independently of lastPrice. Publish only
        // an explicitly supplied fresh turnover (never a cached snapshot value).
        // This changes the AUTO DOM baseline without fabricating a new quote.
        const rawTurnover = incoming.turnover24h;
        const validTurnoverShape = typeof rawTurnover === 'number' ||
          (typeof rawTurnover === 'string' && rawTurnover.trim().length > 0);
        const turnover24hUsd = validTurnoverShape ? Number(rawTurnover) : NaN;
        const turnoverPresent = Object.prototype.hasOwnProperty.call(incoming, 'turnover24h')
          && Number.isFinite(turnover24hUsd) && turnover24hUsd >= 0;
        if (turnoverPresent) this.emit('turnover24h', { volume24hUsd: turnover24hUsd, time: eventTime });
        // Funding/OI-only deltas may preserve a cached lastPrice, but they
        // are not new price observations. Never refresh the displayed quote
        // timestamp or downstream freshness based on recycled lastPrice.
        if (Object.prototype.hasOwnProperty.call(incoming, 'lastPrice') &&
            Number.isFinite(lastPrice) && lastPrice > 0) {
          this.emit('price', {
            price: lastPrice,
            high24h,
            low24h,
            // Do not mislabel a cached Bybit turnover as a fresh observation.
            volume24hUsd: turnoverPresent ? turnover24hUsd : undefined,
            change24h: Number(data.price24hPcnt || 0) * 100,
            time: eventTime,
          });
        }
      }
    }

    // Bybit already streams current OI in the ticker snapshot/deltas.
    // Forward this public value to subscribers instead of polling the REST
    // history endpoint every 15 seconds for every monitored user.
    if (topic === `tickers.${symbol}` && freshEvent && this.marketType === 'futures') {
      const incoming = Array.isArray(msg.data) ? msg.data[0] : msg.data;
      // Delta payload fields are optional. Never pair a new open-interest
      // amount with a value from an old snapshot, or re-emit a stale pair
      // merely because price/funding changed on the same ticker topic.
      const hasFreshPair = incoming && typeof incoming === 'object' &&
        Object.prototype.hasOwnProperty.call(incoming, 'openInterest') &&
        Object.prototype.hasOwnProperty.call(incoming, 'openInterestValue') &&
        (incoming.symbol === undefined || normalizeExchangeSymbol(incoming.symbol) === symbol);
      const amountCoins = Number(incoming?.openInterest);
      const valueUsd = Number(incoming?.openInterestValue);
      if (hasFreshPair && Number.isFinite(amountCoins) && amountCoins > 0 &&
          Number.isFinite(valueUsd) && valueUsd > 0) {
        this.emit('open-interest', { amountCoins, valueUsd, time: eventTime });
      }
    }

    // Public trades
    if (topic === `publicTrade.${symbol}` && freshEvent) {
      const tradeList = Array.isArray(msg.data) ? msg.data : [msg.data];
      for (const t of tradeList) {
        if (!t || (t.s !== undefined && normalizeExchangeSymbol(t.s) !== symbol)) continue;
        const tradeTime = Number(t.T ?? eventTime);
        if (!isFreshDepthTime(tradeTime)) continue;
        const price = Number(t.p);
        const quantity = Number(t.v);
        const side = typeof t.S === 'string' ? t.S.toUpperCase() : '';
        if (Number.isFinite(price) && price > 0 && Number.isFinite(quantity) && quantity > 0 &&
            (side === 'BUY' || side === 'SELL')) {
          this.emit('trade', {
            id: typeof t.i === 'string' ? t.i : undefined,
            price,
            quantity,
            side,
            time: tradeTime,
            isBuyerMaker: side === 'SELL',
          } as RawTradeEvent);
        }
      }
    }

    // Aggregated price levels from the selected instrument's 1000-level stream.
    if (topic.startsWith('orderbook.')) {
      this.bybitBook.push(msg);
    }
  }

  private startWatchdog() {
    this.watchdogTimer = setInterval(() => {
      if (this.isDestroyed) return;
      const now = Date.now();
      const elapsed = now - this.lastDataReceivedAt;

      // Watchdog: If no message for > 12 seconds, consider STALE and trigger reconnect
      const depthElapsed = now - (this.lastDepthReceivedAt || this.connectionStartedAt);
      if ((elapsed > 12000 || depthElapsed > 12000) && this.status !== 'CONNECTING') {
        this.setStatus('STALE');
        console.warn(`[Watchdog] Stale stream detected for ${this.symbol} (${this.exchange}) - reconnecting`);
        this.scheduleReconnect();
      }
    }, 4000);
  }

  private requestBookResync() {
    this.setStatus('RESYNCING');
    if (this.exchange === 'binance') void this.loadBinanceSnapshot();
    else this.scheduleReconnect();
  }

  public resyncOrderBook() {
    this.binanceBook.reset();
    this.bybitBook.reset();
    this.requestBookResync();
  }

  private scheduleReconnect() {
    if (this.isDestroyed || this.reconnectTimeout) return;
    const backoffIndex = Math.min(this.reconnectAttempts, this.backoffSchedule.length - 1);
    const delay = this.backoffSchedule[backoffIndex];
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (!this.isDestroyed) {
        this.connect();
      }
    }, delay);
  }

  private cleanupSocket() {
    if (this.snapshotRetry) { clearTimeout(this.snapshotRetry); this.snapshotRetry = null; }
    for (const socket of this.additionalSockets) {
      socket.removeAllListeners();
      socket.on('error', () => {});
      try { socket.close(); } catch {}
    }
    this.additionalSockets = [];
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        // Closing during the opening handshake emits an asynchronous error.
        // Keep a listener while the discarded socket shuts down.
        this.ws.on('error', () => {});
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.cleanupSocket();
    this.removeAllListeners();
  }
}
