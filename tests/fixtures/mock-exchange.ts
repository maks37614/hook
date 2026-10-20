// Only preloaded by offline tests. The production gateway and socket pool still run unchanged.
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { exchangeStreamPool } from '../../server/exchangeStreamPool';
import { exchangeProvider } from '../../src/utils/exchangeEndpoints';
const native = globalThis.fetch;
const symbols = ['BTCUSDT'];

const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function candles(interval: string, limit: number) {
  const seconds = ({ '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1': 60, '5': 300, '15': 900, '60': 3600, '240': 14400, D: 86400 } as Record<string, number>)[interval] || 60;
  const end = Math.floor(Date.now() / (seconds * 1000)) * seconds * 1000;
  return Array.from({ length: limit }, (_, i) => [end - (limit - i) * seconds * 1000, '100', '102', '98', '100', '2000', end - (limit - i - 1) * seconds * 1000 - 1]);
}
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const provider = exchangeProvider(url);
  if (!provider) return native(input, init);
  const symbol = url.searchParams.get('symbol') || 'BTCUSDT';
  if (/klines$|\/kline$/.test(url.pathname)) {
    const rows = candles(url.searchParams.get('interval') || '1m', Math.min(Number(url.searchParams.get('limit') || 300), 1000));
    return provider === 'bybit' ? json({ retCode: 0, result: { list: rows.reverse().map(row => row.map(String)) } }) : json(rows);
  }
  if (/depth$|orderbook$/.test(url.pathname)) return provider === 'binance' ? json({ lastUpdateId: 100, bids: [['99', '2000']], asks: [['101', '2000']] }) : json({ retCode: 0, result: { u: 100, b: [['99', '2000']], a: [['101', '2000']] } });
  if (/exchangeInfo$/.test(url.pathname)) return json({ symbols: symbols.map(symbol => ({ symbol, baseAsset: symbol.slice(0, -4), quoteAsset: 'USDT', status: 'TRADING', filters: [{ filterType: 'PRICE_FILTER', tickSize: '0.000000001' }] })) });
  if (/instruments-info$/.test(url.pathname)) return json({ retCode: 0, result: { list: symbols.map(symbol => ({ symbol, baseCoin: symbol.slice(0, -4), quoteCoin: 'USDT', status: 'Trading', priceFilter: { tickSize: '0.000000001' } })), nextPageCursor: '' } });
  if (/openInterestHist$/.test(url.pathname)) return json(Array.from({ length: 15 }, (_, index) => ({ timestamp: Date.now() - (14 - index) * 300000, sumOpenInterestValue: String(100000 + index * 100), sumOpenInterest: '1000' })));
  if (/open-interest$/.test(url.pathname)) return json({ retCode: 0, result: { list: Array.from({ length: 15 }, (_, index) => ({ timestamp: String(Date.now() - index * 300000), openInterest: String(1000 - index) })) } });
  if (/openInterest$/.test(url.pathname)) return json({ openInterest: '1000', symbol, time: Date.now() });
  if (/premiumIndex$/.test(url.pathname)) return json({ symbol, markPrice: '100', lastFundingRate: '0' });
  if (/fundingRate$/.test(url.pathname)) return json(Array.from({ length: 10 }, (_, n) => ({ fundingRate: '0', fundingTime: Date.now() - n * 28800000 })));
  if (/funding\/history$/.test(url.pathname)) return json({ retCode: 0, result: { list: Array.from({ length: 10 }, (_, n) => ({ fundingRate: '0', fundingRateTimestamp: String(Date.now() - n * 28800000) })) } });
  if (/aggTrades$|\/trades$/.test(url.pathname)) return json([{ a: 1, p: '100', q: '2', T: Date.now(), m: false }]);
  if (/recent-trade$/.test(url.pathname)) return json({ retCode: 0, result: { list: [{ execId: '1', price: '100', size: '2', side: 'Buy', time: String(Date.now()) }] } });
  if (/ticker\/price$/.test(url.pathname)) return json({ symbol, price: '100' });
  const ticker = { symbol, lastPrice: '100', priceChangePercent: '2', price24hPcnt: '0.02', quoteVolume: '20000000', turnover24h: '20000000', highPrice: '102', lowPrice: '98', highPrice24h: '102', lowPrice24h: '98', openInterestValue: '100000', openInterest: '1000', fundingRate: '0' };
  return provider === 'bybit' ? json({ retCode: 0, result: { list: symbols.map(symbol => ({ ...ticker, symbol })) } }) : json(symbols.map(symbol => ({ ...ticker, symbol })));
};

class Socket extends EventEmitter {
  readyState = 0;
  private timer?: ReturnType<typeof setInterval>;
  private topics = new Set<string>();
  constructor(readonly source: string) {
    super();
    const url = new URL(source);
    if (!source.includes('bybit')) for (const topic of (url.searchParams.get('streams') || '').split('/')) this.topics.add(topic);
    setTimeout(() => { if (this.readyState === 3) return; this.readyState = 1; this.emit('open'); this.timer = setInterval(() => this.tick(), 100); }, 1);
  }
  send(value: string) {
    const command = JSON.parse(value);
    if (command.op === 'ping') { this.emit('message', Buffer.from('{"op":"pong"}')); return; }
    for (const topic of command.args || command.params || []) {
      if (command.op === 'unsubscribe' || command.method === 'UNSUBSCRIBE') this.topics.delete(topic); else this.topics.add(topic);
    }
  }
  private sequence = 100;
  private tick() {
    if (process.env.BACKGROUND_STREAM_PAUSE_FILE && fs.existsSync(process.env.BACKGROUND_STREAM_PAUSE_FILE)) return;
    for (const stream of this.topics) {
      const seq = this.sequence++;
      const isPrint = stream.startsWith('publicTrade.') || /@(aggTrade|trade)$/.test(stream);
      if (this.source.includes('bybit')) {
        const depth = stream.startsWith('orderbook');
        this.emit('message', Buffer.from(JSON.stringify({ topic: stream, type: 'snapshot', ts: Date.now(), data: depth ? { u: seq, b: [['99', '2000']], a: [['101', '2000']] } : stream.startsWith('publicTrade') ? [{ i: String(seq), s: stream.split('.').at(-1), p: '100', v: '2', S: 'Buy', T: Date.now() }] : { lastPrice: '100', highPrice24h: '102', lowPrice24h: '98', turnover24h: '20000000' } })));
      } else {
        const symbol = stream.split('@')[0].toUpperCase();
        const data = stream.includes('@depth') ? { e: 'depthUpdate', U: seq + 1, u: seq + 1, pu: seq, b: [['99', '2000']], a: [['101', '2000']], E: Date.now() }
          : stream.includes('@bookTicker') ? { e: 'bookTicker', s: symbol, u: seq, b: '99', B: '2000', a: '101', A: '2000', E: Date.now() }
          : stream.includes('@kline') ? { e: 'kline', k: { t: Math.floor(Date.now() / 60000) * 60000, o: '100', h: '102', l: '98', c: '100', v: '2000', x: false } }
          : isPrint ? { e: stream.includes('@aggTrade') ? 'aggTrade' : 'trade', s: symbol, a: seq, t: seq, p: '100', q: '2', T: Date.now(), m: false } : { e: '24hrTicker', s: symbol, c: '100', h: '102', l: '98', q: '20000000', P: '2', E: Date.now() };
        this.emit('message', Buffer.from(JSON.stringify({ stream, data })));
      }
    }
  }
  terminate() { if (this.timer) clearInterval(this.timer); this.readyState = 3; this.emit('close'); }
}
(exchangeStreamPool as any).create = (url: string) => new Socket(url);
